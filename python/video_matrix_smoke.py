"""Video format matrix smoke test powered by ffmpeg.

This script does two rounds:
1) output coverage: mp4 source -> each target format
2) input coverage: each generated format -> mp4

Use this to quickly spot unsupported codec/muxer combinations on the current machine.
"""

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

FORMATS = [
    "3gp", "3gpp", "avi", "bik", "flv", "gif", "m4v", "mkv", "mp4",
    "mpg", "mpeg", "mov", "ogv", "rm", "ts", "vob", "webm", "wmv",
]

DEFAULT_CODECS = {
    "3gp": ("h263", "aac"),
    "3gpp": ("h263", "aac"),
    "avi": ("mpeg4", "libmp3lame"),
    "bik": ("binkvideo", "none"),
    "flv": ("flv", "aac"),
    "gif": ("gif", "none"),
    "m4v": ("libx264", "aac"),
    "mkv": ("libx264", "aac"),
    "mp4": ("libx264", "aac"),
    "mpg": ("mpeg2video", "mp2"),
    "mpeg": ("mpeg2video", "mp2"),
    "mov": ("libx264", "aac"),
    "ogv": ("libtheora", "libvorbis"),
    "rm": ("mpeg4", "aac"),
    "ts": ("mpeg2video", "mp2"),
    "vob": ("mpeg2video", "ac3"),
    "webm": ("libvpx-vp9", "libopus"),
    "wmv": ("wmv2", "wmav2"),
}

MUXER_BY_EXT = {
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


def run_cmd(cmd: list[str], timeout: int) -> tuple[bool, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if proc.returncode == 0:
            return True, ""
        err = (proc.stderr or proc.stdout or "ffmpeg failed").strip()
        return False, err
    except Exception as exc:
        return False, str(exc)


def build_convert_cmd(ffmpeg_bin: str, src: Path, dst: Path, fmt: str) -> list[str]:
    video_codec, audio_codec = DEFAULT_CODECS[fmt]
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        str(src),
        "-c:v",
        video_codec,
        "-preset",
        "fast",
    ]

    if audio_codec == "none":
        cmd.append("-an")
    else:
        cmd.extend(["-c:a", audio_codec, "-b:a", "128k"])

    muxer = MUXER_BY_EXT.get(fmt)
    if muxer:
        cmd.extend(["-f", muxer])

    cmd.append(str(dst))
    return cmd


def create_source(ffmpeg_bin: str, path: Path, timeout: int) -> tuple[bool, str]:
    cmd = [
        ffmpeg_bin,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=1280x720:rate=25",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:sample_rate=48000",
        "-t",
        "3",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        str(path),
    ]
    return run_cmd(cmd, timeout)


def main() -> int:
    parser = argparse.ArgumentParser(description="Video format matrix smoke test")
    parser.add_argument("--out-dir", default="", help="Output directory (default: output/video_matrix_smoke_<timestamp>)")
    parser.add_argument("--timeout", type=int, default=120, help="Timeout seconds for each ffmpeg call")
    parser.add_argument("--quick", action="store_true", help="Run a reduced format set for faster checks")
    args = parser.parse_args()

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        print(json.dumps({"success": False, "error": "ffmpeg not found"}, ensure_ascii=False))
        return 1

    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.out_dir).resolve() if args.out_dir else Path("output") / f"video_matrix_smoke_{now}"
    out_dir.mkdir(parents=True, exist_ok=True)

    formats = FORMATS if not args.quick else ["mp4", "mkv", "webm", "avi", "mov", "gif"]

    source_mp4 = out_dir / "source.mp4"
    ok, err = create_source(ffmpeg_bin, source_mp4, args.timeout)
    if not ok:
        print(json.dumps({"success": False, "error": f"failed to create source video: {err}"}, ensure_ascii=False))
        return 1

    output_round = []
    generated = {}

    for fmt in formats:
        dst = out_dir / f"to_{fmt}.{fmt}"
        cmd = build_convert_cmd(ffmpeg_bin, source_mp4, dst, fmt)
        ok, err = run_cmd(cmd, args.timeout)
        item = {"from": "mp4", "to": fmt, "success": ok, "output": str(dst) if ok else "", "error": err}
        output_round.append(item)
        if ok and dst.exists():
            generated[fmt] = dst

    input_round = []
    for fmt in formats:
        src = generated.get(fmt)
        if not src:
            input_round.append({
                "from": fmt,
                "to": "mp4",
                "success": False,
                "output": "",
                "error": "skipped because output coverage failed",
            })
            continue

        dst = out_dir / f"from_{fmt}_to_mp4.mp4"
        cmd = build_convert_cmd(ffmpeg_bin, src, dst, "mp4")
        ok, err = run_cmd(cmd, args.timeout)
        input_round.append({"from": fmt, "to": "mp4", "success": ok, "output": str(dst) if ok else "", "error": err})

    output_success = sum(1 for x in output_round if x["success"])
    input_success = sum(1 for x in input_round if x["success"])

    report = {
        "success": True,
        "out_dir": str(out_dir.resolve()),
        "formats": formats,
        "output_round": output_round,
        "input_round": input_round,
        "summary": {
            "output_success": output_success,
            "output_fail": len(output_round) - output_success,
            "input_success": input_success,
            "input_fail": len(input_round) - input_success,
        },
    }

    report_path = out_dir / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
