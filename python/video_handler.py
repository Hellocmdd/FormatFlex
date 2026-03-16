"""Video conversion handler powered by ffmpeg/ffprobe."""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from path_utils import (
    create_unique_child_dir,
    resolve_ffmpeg_executables,
    resolve_input_path,
    resolve_output_dir,
    resolve_output_file,
)

SUPPORTED_VIDEO_FORMATS = {
    "3gp", "3gpp", "avi", "bik", "flv", "gif", "m4v", "mkv", "mp4",
    "mpg", "mpeg", "mov", "ogv", "rm", "ts", "vob", "webm", "wmv",
}

VIDEO_CODEC_OPTIONS = {
    "auto", "libx264", "libx265", "libvpx", "libvpx-vp9", "mpeg4", "mpeg2video",
    "wmv2", "flv", "mjpeg", "libtheora", "h263", "gif", "binkvideo",
}

AUDIO_CODEC_OPTIONS = {
    "auto", "aac", "libopus", "libvorbis", "libmp3lame", "ac3", "mp2", "wmav2",
    "pcm_s16le", "copy", "none",
}

FFMPEG_MUXER_BY_EXT = {
    "3gp": "3gp",
    "3gpp": "3gp",
    "bik": "bink",
    "gif": "gif",
    "mpeg": "mpeg",
    "mpg": "mpeg",
    "ogv": "ogg",
    "rm": "rm",
    "ts": "mpegts",
    "vob": "vob",
}

DEFAULT_CODECS = {
    "3gp": ("h263", "aac"),
    "3gpp": ("h263", "aac"),
    "avi": ("mpeg4", "mp3"),
    "bik": ("binkvideo", "none"),
    "flv": ("flv", "aac"),
    "gif": ("gif", "none"),
    "m4v": ("libx264", "aac"),
    "mkv": ("libx264", "aac"),
    "mp4": ("libx264", "aac"),
    "mpeg": ("mpeg2video", "mp2"),
    "mpg": ("mpeg2video", "mp2"),
    "mov": ("libx264", "aac"),
    "ogv": ("libtheora", "libvorbis"),
    "rm": ("mpeg4", "aac"),
    "ts": ("mpeg2video", "mp2"),
    "vob": ("mpeg2video", "ac3"),
    "webm": ("libvpx-vp9", "libopus"),
    "wmv": ("wmv2", "wmav2"),
}

PRESET_OPTIONS = {"ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"}


def _target_constraints() -> dict[str, dict[str, list[str]]]:
    """Return per-target codec constraints for frontend and validation."""
    return {
        "webm": {
            "video_codecs": ["libvpx", "libvpx-vp9"],
            "audio_codecs": ["libopus", "libvorbis", "none"],
        },
        "gif": {
            "video_codecs": ["gif"],
            "audio_codecs": ["none"],
        },
        "3gp": {
            "video_codecs": ["h263", "mpeg4", "libx264"],
            "audio_codecs": ["aac", "none"],
        },
        "3gpp": {
            "video_codecs": ["h263", "mpeg4", "libx264"],
            "audio_codecs": ["aac", "none"],
        },
    }


def _emit_stream_event(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    sys.stdout.flush()


def _ensure_ffmpeg_tools() -> tuple[str | None, str | None]:
    return resolve_ffmpeg_executables()


def _parse_codec_list(ffmpeg_output: str) -> tuple[set[str], set[str]]:
    """Parse ffmpeg -encoders output into video/audio codec sets."""
    video = set()
    audio = set()

    for raw in (ffmpeg_output or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("--"):
            continue

        parts = re.split(r"\s+", line)
        if len(parts) < 2:
            continue

        flags = parts[0]
        codec = parts[1].strip()
        if len(flags) < 1 or not codec:
            continue

        if flags[0] == "V":
            video.add(codec)
        elif flags[0] == "A":
            audio.add(codec)

    return video, audio


def _get_available_encoders(ffmpeg_bin: str | None) -> tuple[set[str], set[str]]:
    """Return available video/audio encoders discovered from ffmpeg runtime."""
    if not ffmpeg_bin:
        return set(), set()

    try:
        result = subprocess.run([ffmpeg_bin, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=30)
        text = (result.stdout or "") + "\n" + (result.stderr or "")
        return _parse_codec_list(text)
    except Exception:
        return set(), set()


def _ext(path: str) -> str:
    return Path(path).suffix.lower().lstrip(".")


def _unique_path(path: str) -> str:
    p = Path(path)
    if not p.exists():
        return str(p)

    stem = p.stem
    suffix = p.suffix
    parent = p.parent
    idx = 2
    while True:
        candidate = parent / f"{stem}_{idx}{suffix}"
        if not candidate.exists():
            return str(candidate)
        idx += 1


def _build_default_output(input_file: str, output_dir: str, target_format: str) -> str:
    src = Path(input_file).resolve()
    return str((Path(output_dir) / f"{src.stem}.{target_format}").resolve())


def _validate_format(fmt: str, field_name: str = "format") -> tuple[bool, str]:
    value = (fmt or "").strip().lower()
    if not value:
        return False, f"{field_name} is required"
    if value not in SUPPORTED_VIDEO_FORMATS:
        allowed = ", ".join(sorted(SUPPORTED_VIDEO_FORMATS))
        return False, f"Unsupported {field_name}: {value}. Allowed formats: {allowed}"
    return True, ""


def _validate_input_ext(input_file: str) -> tuple[bool, str]:
    return _validate_format(_ext(input_file), "input_format")


def _validate_codec(codec: str, allowed: set[str], field_name: str) -> tuple[bool, str]:
    value = (codec or "auto").strip().lower()
    if value not in allowed:
        text = ", ".join(sorted(allowed))
        return False, f"Unsupported {field_name}: {value}. Allowed values: {text}"
    return True, ""


def _normalize_resolution(resolution: str) -> tuple[bool, str, str]:
    value = (resolution or "").strip().lower()
    if value in {"", "source", "original", "keep"}:
        return True, "", ""

    if "x" not in value:
        return False, "", "resolution must look like WIDTHxHEIGHT, for example 1920x1080"

    parts = value.split("x", 1)
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return False, "", "resolution must look like WIDTHxHEIGHT, for example 1920x1080"

    width = int(parts[0])
    height = int(parts[1])
    if width <= 0 or height <= 0:
        return False, "", "resolution width and height must be positive"

    return True, f"{width}x{height}", ""


def _build_video_filter(resolution: str, fps: float) -> str:
    filters = []
    if resolution:
        width, height = resolution.split("x", 1)
        filters.append(f"scale={width}:{height}:flags=lanczos")
    if fps and fps > 0:
        filters.append(f"fps={fps:g}")
    return ",".join(filters)


def _select_video_codec(target_format: str, video_codec: str) -> str:
    selected = (video_codec or "auto").strip().lower()
    if selected == "auto":
        return DEFAULT_CODECS[target_format][0]
    return selected


def _select_audio_codec(target_format: str, audio_codec: str) -> str:
    selected = (audio_codec or "auto").strip().lower()
    if target_format == "gif":
        return "none"
    if selected == "auto":
        return DEFAULT_CODECS[target_format][1]
    return selected


def _is_codec_allowed_for_target(target_format: str, video_codec: str, audio_codec: str) -> tuple[bool, str]:
    if target_format == "gif" and audio_codec not in {"none", ""}:
        return False, "GIF does not support audio tracks. Use audio_codec=none"

    if target_format == "webm":
        if video_codec not in {"libvpx", "libvpx-vp9"}:
            return False, "WEBM requires video codec libvpx or libvpx-vp9"
        if audio_codec not in {"libopus", "libvorbis", "none"}:
            return False, "WEBM requires audio codec libopus, libvorbis, or none"

    if target_format in {"3gp", "3gpp"} and video_codec not in {"h263", "mpeg4", "libx264"}:
        return False, "3GP/3GPP requires video codec h263, mpeg4, or libx264"

    return True, ""


def _is_codec_available(codec: str, available: set[str], kind: str) -> tuple[bool, str]:
    value = (codec or "").strip().lower()
    if kind == "audio" and value in {"none", "copy"}:
        return True, ""
    if not value:
        return False, f"{kind} codec is empty"
    if value not in available:
        return False, f"Codec '{value}' is not available in current ffmpeg build"
    return True, ""


def _summarize_probe_info(data: dict) -> dict:
    """Build a compact summary from ffprobe JSON for frontend display."""
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    fps_text = str(video_stream.get("avg_frame_rate") or "0/0")
    fps_value = 0.0
    if "/" in fps_text:
        num, den = fps_text.split("/", 1)
        try:
            n = float(num)
            d = float(den)
            if d != 0:
                fps_value = n / d
        except Exception:
            fps_value = 0.0

    return {
        "format": str(fmt.get("format_name") or ""),
        "duration": float(fmt.get("duration") or 0),
        "size": int(fmt.get("size") or 0),
        "bit_rate": int(fmt.get("bit_rate") or 0),
        "video_codec": str(video_stream.get("codec_name") or ""),
        "audio_codec": str(audio_stream.get("codec_name") or ""),
        "width": width,
        "height": height,
        "fps": round(fps_value, 3),
        "has_audio": bool(audio_stream),
        "streams": len(streams),
    }


def _build_ffmpeg_command(
    ffmpeg_bin: str,
    input_file: str,
    output_file: str,
    target_format: str,
    resolution: str,
    fps: float,
    video_bitrate: str,
    audio_bitrate: str,
    video_codec: str,
    audio_codec: str,
    preset: str,
) -> list[str]:
    cmd = [ffmpeg_bin, "-y", "-i", input_file]

    vf = _build_video_filter(resolution, fps)
    if vf:
        cmd.extend(["-vf", vf])

    cmd.extend(["-c:v", video_codec])
    if video_bitrate:
        cmd.extend(["-b:v", video_bitrate])

    if preset and preset in PRESET_OPTIONS and video_codec in {"libx264", "libx265", "libvpx", "libvpx-vp9"}:
        cmd.extend(["-preset", preset])

    if audio_codec == "none":
        cmd.append("-an")
    else:
        cmd.extend(["-c:a", audio_codec])
        if audio_bitrate and audio_codec != "copy":
            cmd.extend(["-b:a", audio_bitrate])

    muxer = FFMPEG_MUXER_BY_EXT.get(target_format)
    if muxer:
        cmd.extend(["-f", muxer])

    cmd.append(output_file)
    return cmd


def convert_video(
    input_file: str,
    target_format: str,
    output_file: str = "",
    resolution: str = "",
    fps: float = 0,
    video_bitrate: str = "",
    audio_bitrate: str = "",
    video_codec: str = "auto",
    audio_codec: str = "auto",
    preset: str = "medium",
) -> dict:
    """Convert one video file to a target video format."""
    try:
        ffmpeg_bin, _ = _ensure_ffmpeg_tools()
        if not ffmpeg_bin:
            return {"success": False, "error": "ffmpeg not found. Install with: sudo apt install ffmpeg"}

        available_video_encoders, available_audio_encoders = _get_available_encoders(ffmpeg_bin)

        input_file = resolve_input_path(input_file, __file__)
        if not os.path.exists(input_file):
            return {
                "success": False,
                "error": f"Input file not found: {input_file}. Please select files using native file picker so absolute paths are available.",
            }

        ok, err = _validate_input_ext(input_file)
        if not ok:
            return {"success": False, "error": err}

        ok, err = _validate_format(target_format, "target_format")
        if not ok:
            return {"success": False, "error": err}

        ok, normalized_resolution, err = _normalize_resolution(resolution)
        if not ok:
            return {"success": False, "error": err}

        fps_num = float(fps or 0)
        if fps_num < 0:
            return {"success": False, "error": "fps must be greater than or equal to 0"}

        ok, err = _validate_codec(video_codec, VIDEO_CODEC_OPTIONS, "video_codec")
        if not ok:
            return {"success": False, "error": err}

        ok, err = _validate_codec(audio_codec, AUDIO_CODEC_OPTIONS, "audio_codec")
        if not ok:
            return {"success": False, "error": err}

        target = target_format.strip().lower()
        picked_video_codec = _select_video_codec(target, video_codec)
        picked_audio_codec = _select_audio_codec(target, audio_codec)

        ok, err = _is_codec_allowed_for_target(target, picked_video_codec, picked_audio_codec)
        if not ok:
            return {"success": False, "error": err}

        ok, err = _is_codec_available(picked_video_codec, available_video_encoders, "video")
        if not ok:
            return {"success": False, "error": err}

        ok, err = _is_codec_available(picked_audio_codec, available_audio_encoders, "audio")
        if not ok:
            return {"success": False, "error": err}

        if output_file and str(output_file).strip():
            output_file = resolve_output_file(output_file, __file__)
        else:
            output_file = str(Path(input_file).with_suffix(f".{target}"))

        output_file = _unique_path(output_file)
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)

        cmd = _build_ffmpeg_command(
            ffmpeg_bin=ffmpeg_bin,
            input_file=input_file,
            output_file=output_file,
            target_format=target,
            resolution=normalized_resolution,
            fps=fps_num,
            video_bitrate=(video_bitrate or "").strip(),
            audio_bitrate=(audio_bitrate or "").strip(),
            video_codec=picked_video_codec,
            audio_codec=picked_audio_codec,
            preset=(preset or "medium").strip().lower(),
        )

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0 or not os.path.exists(output_file):
            detail = (result.stderr or result.stdout or "Unknown ffmpeg error").strip()
            return {"success": False, "error": f"ffmpeg conversion failed: {detail}"}

        return {
            "success": True,
            "output": output_file,
            "target_format": target,
            "config_applied": {
                "resolution": normalized_resolution or "source",
                "fps": fps_num,
                "video_bitrate": (video_bitrate or "").strip(),
                "audio_bitrate": (audio_bitrate or "").strip(),
                "video_codec": picked_video_codec,
                "audio_codec": picked_audio_codec,
                "preset": (preset or "medium").strip().lower(),
            },
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def convert_video_batch_stream(
    input_files: list,
    target_format: str,
    output_dir: str = "",
    resolution: str = "",
    fps: float = 0,
    video_bitrate: str = "",
    audio_bitrate: str = "",
    video_codec: str = "auto",
    audio_codec: str = "auto",
    preset: str = "medium",
) -> dict:
    """Stream per-file progress events for batch video conversion."""
    try:
        if not input_files:
            _emit_stream_event({"type": "error", "error": "No input files provided"})
            return {"success": False, "error": "No input files provided"}

        ffmpeg_bin, _ = _ensure_ffmpeg_tools()
        if not ffmpeg_bin:
            msg = "ffmpeg not found. Install with: sudo apt install ffmpeg"
            _emit_stream_event({"type": "error", "error": msg})
            return {"success": False, "error": msg}

        ok, err = _validate_format(target_format, "target_format")
        if not ok:
            _emit_stream_event({"type": "error", "error": err})
            return {"success": False, "error": err}

        ok, normalized_resolution, err = _normalize_resolution(resolution)
        if not ok:
            _emit_stream_event({"type": "error", "error": err})
            return {"success": False, "error": err}

        resolved_inputs = []
        bootstrap_errors = []
        for raw in input_files:
            resolved = resolve_input_path(str(raw), __file__)
            if not os.path.exists(resolved):
                bootstrap_errors.append({
                    "input": resolved,
                    "error": f"Input file not found: {resolved}. Please select files using native file picker so absolute paths are available.",
                })
                continue
            resolved_inputs.append(resolved)

        target = target_format.strip().lower()
        if output_dir and str(output_dir).strip():
            output_dir = resolve_output_dir(output_dir, __file__)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        elif resolved_inputs:
            output_dir = create_unique_child_dir(resolved_inputs[0], f"video_{target}")
        else:
            output_dir = ""

        outputs = []
        errors = list(bootstrap_errors)
        total = len(input_files)
        success_count = 0
        fail_count = len(bootstrap_errors)

        _emit_stream_event({
            "type": "start",
            "total": total,
            "success_count": success_count,
            "fail_count": fail_count,
            "output": output_dir,
            "config_applied": {
                "resolution": normalized_resolution or "source",
                "fps": float(fps or 0),
                "video_bitrate": (video_bitrate or "").strip(),
                "audio_bitrate": (audio_bitrate or "").strip(),
                "video_codec": (video_codec or "auto").strip().lower(),
                "audio_codec": (audio_codec or "auto").strip().lower(),
                "preset": (preset or "medium").strip().lower(),
            },
        })

        for index, input_path in enumerate(resolved_inputs, start=1):
            ok, err = _validate_input_ext(input_path)
            if not ok:
                fail_count += 1
                errors.append({"input": input_path, "error": err})
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "success": False,
                    "error": err,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })
                continue

            planned_output = _build_default_output(input_path, output_dir, target)
            planned_output = _unique_path(planned_output)

            result = convert_video(
                input_file=input_path,
                target_format=target,
                output_file=planned_output,
                resolution=normalized_resolution,
                fps=float(fps or 0),
                video_bitrate=video_bitrate,
                audio_bitrate=audio_bitrate,
                video_codec=video_codec,
                audio_codec=audio_codec,
                preset=preset,
            )
            if result.get("success"):
                success_count += 1
                out_file = str(result.get("output"))
                outputs.append(out_file)
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "output_file": out_file,
                    "success": True,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })
            else:
                fail_count += 1
                error_msg = str(result.get("error", "Unknown conversion error"))
                errors.append({"input": input_path, "error": error_msg})
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "success": False,
                    "error": error_msg,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })

        final_payload = {
            "type": "done",
            "success": success_count > 0,
            "output": output_dir,
            "outputs": outputs,
            "success_count": success_count,
            "fail_count": fail_count,
            "errors": errors,
            "total": total,
        }
        _emit_stream_event(final_payload)
        return final_payload
    except Exception as exc:
        _emit_stream_event({"type": "error", "error": str(exc)})
        return {"success": False, "error": str(exc)}


def probe_video_info(input_file: str) -> dict:
    """Get media info for one video via ffprobe."""
    try:
        _, ffprobe_bin = _ensure_ffmpeg_tools()
        if not ffprobe_bin:
            return {
                "success": False,
                "error": "ffprobe not found. Install with: sudo apt install ffmpeg",
            }

        input_file = resolve_input_path(input_file, __file__)
        if not os.path.exists(input_file):
            return {
                "success": False,
                "error": f"Input file not found: {input_file}. Please select the file using native file picker so absolute path is available.",
            }

        cmd = [
            ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "format=duration,bit_rate,format_name,size",
            "-show_streams",
            "-of",
            "json",
            input_file,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "Unknown ffprobe error").strip()
            return {"success": False, "error": f"ffprobe failed: {detail}"}

        data = json.loads(result.stdout or "{}")
        return {
            "success": True,
            "info": data,
            "summary": _summarize_probe_info(data),
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def supported_video_formats() -> dict:
    """Return supported input/output formats and codec options."""
    ffmpeg_bin, _ = _ensure_ffmpeg_tools()
    available_video_encoders, available_audio_encoders = _get_available_encoders(ffmpeg_bin)

    return {
        "success": True,
        "input_formats": sorted(SUPPORTED_VIDEO_FORMATS),
        "output_formats": sorted(SUPPORTED_VIDEO_FORMATS),
        "video_codec_options": sorted(VIDEO_CODEC_OPTIONS),
        "audio_codec_options": sorted(AUDIO_CODEC_OPTIONS),
        "preset_options": sorted(PRESET_OPTIONS),
        "available_video_encoders": sorted(available_video_encoders),
        "available_audio_encoders": sorted(available_audio_encoders),
        "target_constraints": _target_constraints(),
    }


OPERATIONS = {
    "convert_video": convert_video,
    "convert_video_batch_stream": convert_video_batch_stream,
    "probe_video_info": probe_video_info,
    "supported_video_formats": supported_video_formats,
}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video Conversion Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))
