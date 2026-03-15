"""Audio conversion handler powered by ffmpeg/ffprobe."""
import argparse
import base64
import hashlib
import json
import os
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from path_utils import (
    create_unique_child_dir,
    resolve_input_path,
    resolve_output_dir,
    resolve_output_file,
)

SUPPORTED_INPUT_FORMATS = {
    "3gp", "3gpp", "aac", "aiff", "ape", "avi", "bik", "cda", "flac", "flv", "gif",
    "m4v", "mkv", "mp4", "m4a", "m4b", "mp3", "mpg", "mpeg", "mov", "oga", "ogg",
    "ogv", "opus", "rm", "ts", "vob", "wav", "webm", "wma", "wmv",
}

# Phase-1 policy: output only audio-like formats and audio-capable containers.
SUPPORTED_OUTPUT_FORMATS = {
    "3gp", "3gpp", "aac", "aiff", "ape", "flac", "m4a", "m4b", "mp3", "oga", "ogg",
    "opus", "rm", "wav", "wma",
}

CODEC_ARGS = {
    "3gp": ["-c:a", "aac", "-f", "3gp"],
    "3gpp": ["-c:a", "aac", "-f", "3gp"],
    "aac": ["-c:a", "aac"],
    "aiff": ["-c:a", "pcm_s16be"],
    "ape": ["-c:a", "ape"],
    "flac": ["-c:a", "flac"],
    "m4a": ["-c:a", "aac"],
    "m4b": ["-c:a", "aac"],
    "mp3": ["-c:a", "libmp3lame"],
    "oga": ["-c:a", "libvorbis"],
    "ogg": ["-c:a", "libvorbis"],
    "opus": ["-c:a", "libopus"],
    "rm": ["-c:a", "aac"],
    "wav": ["-c:a", "pcm_s16le"],
    "wma": ["-c:a", "wmav2"],
}

PRESET_CONFIGS = {
    "voice": {"bitrate": "96k", "sample_rate": 22050, "channels": 1},
    "music": {"bitrate": "192k", "sample_rate": 44100, "channels": 2},
    "hifi": {"bitrate": "320k", "sample_rate": 48000, "channels": 2},
}

NCM_HEADER = b"CTENFDAM"
NCM_CORE_KEY = bytes.fromhex("687A4852416D736F356B496E62617857")
NCM_META_KEY = bytes.fromhex("2331346C6A6B5F215C5D2630553C2728")
NCM_PREFIX = "ncm"
NCM_OUTPUT_FORMATS = {"mp3", "flac"}
NCM_CACHE_PREFIXES = {"uc"}
KGM_PREFIXES = {"kgm", "kgma", "kgg", "vpr"}
KGM_OUTPUT_FORMATS = {"mp3", "flac"}
# QQ Music / QMCv2 formats (embedded key, decoded via libtakiyasha)
QMC_V2_PREFIXES = {"mflac", "mflac0", "mflac1", "mgg", "mgg1", "mggl", "mggv", "mgg0", "mflach", "mmp4"}
QMC_V1_PREFIXES = {"qmc0", "qmc2", "qmc3", "qmc4", "qmc6", "qmc8", "qmcflac", "qmcogg", "tkm"}
KWM_PREFIXES = {"kwm"}
TM_PREFIXES = {"tm0", "tm2", "tm3", "tm6"}
XIAMI_PREFIXES = {"xm"}
XIMALAYA_PREFIXES = {"x2m", "x3m"}
MIGU_PREFIXES = {"mg3d"}
JOOX_PREFIXES = {"ofl_en"}
JOOX_V4_MAGIC = b"E!04"
JOOX_SALT = bytes([164, 11, 200, 52, 214, 149, 243, 19, 35, 35, 67, 35, 84, 99, 131, 243])
JOOX_CHUNK_SIZE = 1_048_592
QMC_OUTPUT_FORMATS = {"mp3", "flac"}
TM_HEADER = bytes([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])
# All special/encrypted formats that unlock_audio can handle
UNLOCK_ALL_PREFIXES = (
    {NCM_PREFIX} | NCM_CACHE_PREFIXES | KGM_PREFIXES | QMC_V2_PREFIXES | QMC_V1_PREFIXES |
    KWM_PREFIXES | TM_PREFIXES | XIAMI_PREFIXES | XIMALAYA_PREFIXES | MIGU_PREFIXES | JOOX_PREFIXES
)
KGM_TABLE_CONFIG_CANDIDATES = (
    Path(__file__).resolve().parent / "tootls" / "kgm_tables.json",
    Path(__file__).resolve().parent.parent / "tootls" / "kgm_tables.json",
)

KGG_EKEY_V2_PREFIX = "UVFNdXNpYyBFbmNWMixLZXk6"
KGG_EKEY_V2_KEY1 = bytes([0x33, 0x38, 0x36, 0x5A, 0x4A, 0x59, 0x21, 0x40, 0x23, 0x2A, 0x24, 0x25, 0x5E, 0x26, 0x29, 0x28])
KGG_EKEY_V2_KEY2 = bytes([0x2A, 0x2A, 0x23, 0x21, 0x28, 0x23, 0x24, 0x25, 0x26, 0x5E, 0x61, 0x31, 0x63, 0x5A, 0x2C, 0x54])
KGG_DB_DEFAULT_MASTER_KEY = bytes([0x1D, 0x61, 0x31, 0x45, 0xB2, 0x47, 0xBF, 0x7F, 0x3D, 0x18, 0x96, 0x72, 0x14, 0x4F, 0xE4, 0xBF])
KGG_SQLITE_HEADER = b"SQLite format 3\x00"

_KGG_KEY_MAP_CACHE: dict[str, str] | None = None
_KGG_KEY_SOURCE_CACHE: str = ""

_X2M_TABLE_CACHE: tuple[int, ...] | None = None
_X3M_TABLE_CACHE: tuple[int, ...] | None = None
_X2M_SCRAMBLE_TABLE_B64 = "qQKrAlQBqgKoAqwCUwGnAq0CUgGmAv8DAABVAa4CUQGlAv4DAQBWAa8CUAGkAv0DAgBXAbACTwGjAvwDAwBYAbECTgGiAvsDBABZAbICTQGhAvoDBQBaAbMCTAGgAvkDBgBbAbQCSwGfAvgDBwBcAbUCSgGeAvcDCABdAbYCSQGdAvYDCQBeAbcCSAGcAvUDCgBfAbgCRwGbAvQDCwBgAbkCRgGaAvMDDABhAboCRQGZAvIDDQBiAbsCRAGYAvEDDgBjAbwCQwGXAvADDwBkAb0CQgGWAu8DEABlAb4CQQGVAu4DEQBmAb8CQAGUAu0DEgBnAcACPwGTAuwDEwBoAcECPgGSAusDFABpAcICPQGRAuoDFQBqAcMCPAGQAukDFgBrAcQCOwGPAugDFwBsAcUCOgGOAucDGABtAcYCOQGNAuYDGQBuAccCOAGMAuUDGgBvAcgCNwGLAuQDGwBwAckCNgGKAuMDHABxAcoCNQGJAuIDHQByAcsCNAGIAuEDHgBzAcwCMwGHAuADHwB0Ac0CqQD+AVcDIAB1Ac4CqgD/AVgDIQB2Ac8CqwAAAlkDIgB3AdACrAABAloDIwB4AdECrQACAlsDJAB5AdICrgADAlwDJQB6AdMCrwAEAl0DJgB7AdQCsAAFAl4DJwB8AdUCsQAGAl8DKAB9AdYCsgAHAmADKQB+AdcCswAIAmEDKgB/AdgCtAAJAmIDKwCAAdkCtQAKAmMDLACBAdoCtgALAmQDLQCCAdsCtwAMAmUDLgCDAdwCuAANAmYDLwCEAd0CuQAOAmcDMACFAd4CugAPAmgDMQCGAd8CuwAQAmkDMgCHAeACvAARAmoDMwCIAeECvQASAmsDNACJAeICvgATAmwDNQCKAeMCvwAUAm0DNgCLAeQCwAAVAm4DNwCMAeUCwQAWAm8DOACNAeYCwgAXAnADOQCOAecCwwAYAnEDOgCPAegCxAAZAnIDOwCQAekCxQAaAnMDPACRAeoCxgAbAnQDPQCSAesCxwAcAnUDPgCTAewCyAAdAnYDPwCUAe0CyQAeAncDQACVAe4CygAfAngDQQCWAe8CywAgAnkDQgCXAfACzAAhAnoDQwCYAfECzQAiAnsDRACZAfICzgAjAnwDRQCaAfMCzwAkAn0DRgCbAfQC0AAlAn4DRwCcAfUC0QAmAn8DSACdAfYC0gAnAoADSQCeAfcC0wAoAoEDSgCfAfgC1AApAoIDSwCgAfkC1QAqAoMDTAChAfoC1gArAoQDTQCiAfsC1wAsAoUDTgCjAfwC2AAtAoYDTwCkAf0C2QAuAocDUAClAf4C2gAvAogDUQCmAf8C2wAwAokDUgCnAQAD3AAxAooDUwCoAQED3QAyAosDVACpAQID3gAzAowDVQCqAQMD3wA0Ao0DVgCrAQQD4AA1Ao4DVwCsAQUD4QA2Ao8DWACtAQYD4gA3ApADWQCuAQcD4wA4ApEDWgCvAQgD5AA5ApIDWwCwAQkD5QA6ApMDXACxAQoD5gA7ApQDXQCyAQsD5wA8ApUDXgCzAQwD6AA9ApYDXwC0AQ0D6QA+ApcDYAC1AQ4D6gA/ApgDYQC2AQ8D6wBAApkDYgC3ARAD7ABBApoDYwC4ARED7QBCApsDZAC5ARID7gBDApwDZQC6ARMD7wBEAp0DZgC7ARQD8ABFAp4DZwC8ARUD8QBGAp8DaAC9ARYD8gBHAqADaQC+ARcD8wBIAqEDagC/ARgD9ABJAqIDawDAARkD9QBKAqMDbADBARoD9gBLAqQDbQDCARsD9wBMAqUDbgDDARwD+ABNAqYDbwDEAR0D+QBOAqcDcADFAR4D+gBPAqgDcQDGAR8D+wBQAqkDcgDHASAD/ABRAqoDcwDIASED/QBSAqsDdADJASID/gBTAqwDdQDKASMD/wBUAq0DdgDLASQDAAFVAq4DdwDMASUDAQFWAq8DeADNASYDAgFXArADeQDOAScDAwFYArEDegDPASgDBAFZArIDewDQASkDBQFaArMDfADRASoDBgFbArQDfQDSASsDBwFcArUDfgDTASwDCAFdArYDfwDUAS0DCQFeArcDgADVAS4DCgFfArgDgQDWAS8DCwFgArkDggDXATADDAFhAroDgwDYATEDDQFiArsDhADZATIDDgFjArwDhQDaATMDDwFkAr0DhgDbATQDEAFlAr4DhwDcATUDEQFmAr8DiADdATYDEgFnAsADiQDeATcDEwFoAsEDigDfATgDFAFpAsIDiwDgATkDFQFqAsMDjADhAToDFgFrAsQDjQDiATsDFwFsAsUDjgDjATwDGAFtAsYDjwDkAT0DGQFuAscDkADlAT4DGgFvAsgDkQDmAT8DGwFwAskDkgDnAUADHAFxAsoDkwDoAUEDHQFyAssDlADpAUIDHgFzAswDlQDqAUMDHwF0As0DlgDrAUQDIAF1As4DlwDsAUUDIQF2As8DmADtAUYDIgF3AtADmQDuAUcDIwF4AtEDmgDvAUgDJAF5AtIDmwDwAUkDJQF6AtMDnADxAUoDJgF7AtQDnQDyAUsDJwF8AtUDngDzAUwDKAF9AtYDnwD0AU0DKQF+AtcDoAD1AU4DKgF/AtgDoQD2AU8DKwGAAtkDogD3AVADLAGBAtoDowD4AVEDLQGCAtsDpAD5AVIDLgGDAtwDpQD6AVMDLwGEAt0DpgD7AVQDMAGFAt4DpwD8AVUDMQGGAt8DqAD9AVYDMgE="
_X3M_SCRAMBLE_TABLE_B64 = "VgKNAhMCBwNWAZ0DYgBwAcoDNQDtAKQC5AFZA9MAawJlAnQCUQKXAgICIgMmASsDFwECA1wBqANXAEgBgAOQAPYBNQMMAe4CdQHUAysAzABgAnsCPQK7ArYBoQNeAFcBngNhAG8BxgM5APcAuQK4AZ8DYABmAbkDRgAiARwDLwE9A/wAygKkAcwDMwDmAJMCCQIVAz0BWAPVAG4CXgJ9AjoCwAKxAa8DUAA2AUYD7wCqAs4BdgOgABACDANMAYkDggDbAWcDuQA+AroCtwGgA18AZAG3A0gAJQEmAxwBCgNPAY8DcACoAccDOAD1ALUCvQGTA2wAmQHhAx4AswAvAtcCkwHqAxUAnQAKAhQDPgFaA9IAagJnAnICUwKUAggCGQM3AUwD5wCVAgUCHQMuATwD/gDNAqAB1QMqAMgAWAKGAioC3AKOAfcDCAB8ANMBcAOnAB0C8QJxAc0DMgDlAJICCwITAz8BXAPQAGYCcwJSApYCBAIfAyoBMgMPAfQCbAHDAzwAAQHSApoB4AMfALUAMwLJAqYByQM2APAAqwLLAXwDlQD9ASgDGgEGA1gBogNdAFUBnANjAHQB0wMsAM8AZAJ1Ak8CmQL6ASwDFQH/Al8BqwNUAEMBbAOtACUC5QKBAe8DEACMAPEBRAPzAK8CxAGGA4gA4wFbA9EAaQJoAm0CXwJ8AjsCvwKyAa4DUQA7AVUD2gB4AkgCpgLcAWUDwABGAqgC1gFtA6wAJALoAn4B6wMUAJwABwIaAzMBQQP4ALwCtQGjA1wAUgGVA2oAjAH5AwYAegDRAXMDpAAXAv4CYAGtA1IAPAFXA9cAcAJcAoECNQLGAqoBvANDAB0BDQNKAYQDigDnAVMD3QCEAi4C2AKSAewDEwCZAAECIwMkASEDJwEtAxQB/QJhAbADTwA1AUMD9AC0Ar4BkgNtAJ0B2wMkAL4ARAKwAsIBigOAANkBaQO2ADQCyAKnAcgDNwDxAK0CxgGDA40A8gE7AwAB0QKbAd4DIQC7AEACtgK7AZkDZgB6Ad8DIAC4ADwCvQK0AaUDWgBQAZADbwClAcsDNADqAJ0C7gFIA+wAowLlAVYD2ABxAlcCiQIgAuwCeAHZAyYAwgBLAqEC6gFNA+QAkQIMAhIDQQFgA8oAWgKDAjAC0AKcAd0DIgC8AEECswK/AZEDbgCiAdEDLgDWAG8CXQJ/AjcCxAKsAboDRQAhARgDOAFOA+MAjwIRAgsDTQGMA3MAwwGHA4QA3wFiA8cAVQKOAhICCQNTAZYDaQCLAfoDBQB5ANABdAOiABUCAQNdAakDVgBHAXoDmAAAAiQDHwEWAzoBUgPfAIgCIwLpAn0B6QMWAJ4ADQIQA0QBcgOlABkC+gJlAbgDRwAjAR4DLQE4AwcB4AKIAf4DAQB1AMkBfgOTAPkBLwMSAfkCZwG+A0EACwHnAn8B7QMSAJcA/wElAx4BEQNCAWYDugA/ArgCuQGbA2QAdgHWAykAxQBQApgC/AEpAxkBBANaAaYDWQBOAY4DcQCtAbYDSQAoAS4DEwH8AmIBsgNNADEBPwP6AMICrwGzA0wAMAE+A/sAxwKpAb0DQgAWAQADXgGqA1UARgF4A5sABgIbAzIBQAP5AL4CswGsA1MAQAFdA84AYgJ5AkcCpwLXAWsDrgAmAuMChQH2AwkAfQDUAW8DqAAeAvACcgHOAzEA3gCHAigC3wKJAf0DAgB2AMoBfQOUAPsBKgMYAQMDWwGnA1gASwGIA4MA3QFkA8EASgKiAukBUAPhAIsCGgL4AmgBvwNAAAoB5gKAAe4DEQCRAPcBNAMNAe8CcwHPAzAA3ACAAjYCxQKrAbsDRAAgARcDOQFPA+IAjAIYAvsCYwG0A0sALAE3AwgB4gKGAfwDAwB3AMwBewOWAP4BJwMbAQgDVAGXA2gAgwHzAwwAhQDgAWEDyQBZAoUCLALaApAB8gMNAIYA4QFfA8sAWwKCAjICzAKhAdIDLQDUAGwCYwJ3AkkCpQLeAWMDxgBUApACDgIPA0UBdwOfAA8CDgNJAYIDjgDzAToDAgHTApgB4gMdALIALQLZApEB8QMOAIcA4gFeA80AYQJ6AkMCsQLBAYsDfwDYAWoDtAAxAs8CngHaAyUAvwBFAqwCxwGBA48A9QE2AwkB5AKEAfQDCwCBANoBaAO3ADkCwQKwAbEDTgA0AUID9gC3AroBmgNlAHkB3AMjAL0AQgKyAsABjQNyALwBmANnAIIB8AMPAIsA6AFRA+AAigIcAvMCbQHEAzsA/wDOAp8B1wMoAMQATgKbAvABRQPyAK4CxQGFA4kA5gFUA9sAfgI4AsMCrgG1A0oAKwEzAw4B8gJuAcUDOgD9AMsCowHQAy8A2QB2AkwCnwLsAUoD6QCcAu8BRwPuAKkCzwF1A6EAFAIFA1kBpANbAFEBlANrAJYB5gMZAKsAIgLqAnwB5QMaAK8AJwLhAocB/wMAAHQAyAF/A5IA+AExAxAB9gJqAcEDPgAEAdUClQHnAxgAqgAhAusCewHkAxsAsAApAt0CjQH4AwcAewDSAXEDpgAbAvUCawHCAz0AAwHUApcB4wMcALEAKwLbAo8B9QMKAH4A1QFuA6kAHwLtAncB2AMnAMMATQKeAu0BSQPrAKAC6wFLA+gAmgL0ATkDBgHeAooB+wMEAHgAzQF5A5oAAwIgAykBMAMRAfcCaQHAAz8ABQHWApQB6AMXAKMAFgI="
_X2M_KEY = bytes([0x78, 0x6D, 0x6C, 0x79])
_X3M_KEY = bytes([
    0x33, 0x39, 0x38, 0x39, 0x64, 0x31, 0x31, 0x31,
    0x61, 0x61, 0x64, 0x35, 0x36, 0x31, 0x33, 0x39,
    0x34, 0x30, 0x66, 0x34, 0x66, 0x63, 0x34, 0x34,
    0x62, 0x36, 0x33, 0x39, 0x62, 0x32, 0x39, 0x32,
])


def _ensure_ffmpeg_tools() -> tuple[str | None, str | None]:
    ffmpeg_bin = shutil.which("ffmpeg")
    ffprobe_bin = shutil.which("ffprobe")
    return ffmpeg_bin, ffprobe_bin


def _validate_audio_stream_exists(input_file: str, ffprobe_bin: str | None) -> tuple[bool, str]:
    """Return a clear error when input has no audio stream."""
    if not ffprobe_bin:
        # Keep backward compatibility when ffprobe is not available.
        return True, ""

    try:
        cmd = [
            ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            input_file,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            # If probing fails, defer to ffmpeg's own validation/error path.
            return True, ""

        data = json.loads(result.stdout or "{}")
        streams = data.get("streams") or []
        has_audio = any(s.get("codec_type") == "audio" for s in streams)
        if has_audio:
            return True, ""

        has_video = any(s.get("codec_type") == "video" for s in streams)
        if has_video:
            return False, (
                "Input file has no audio stream. This file is video-only, "
                "so it cannot be converted to audio."
            )
        return False, "Input file has no decodable audio stream."
    except Exception:
        # Non-critical probing failures should not block conversion.
        return True, ""


def _ext(path: str) -> str:
    return Path(path).suffix.lower().lstrip(".")


def _build_default_output(input_file: str, output_dir: str, target_format: str) -> str:
    src = Path(input_file).resolve()
    name = f"{src.stem}.{target_format}"
    return str((Path(output_dir) / name).resolve())


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


def _codec_args_for(target_format: str, bitrate: str, sample_rate: int, channels: int) -> list[str]:
    args = CODEC_ARGS.get(target_format, []).copy()

    if target_format in {"mp3", "aac", "m4a", "m4b", "3gp", "3gpp", "wma", "ogg", "oga"} and bitrate:
        args.extend(["-b:a", bitrate])

    if target_format == "opus":
        args.extend(["-vbr", "on"])
        if bitrate:
            args.extend(["-b:a", bitrate])

    if sample_rate > 0:
        args.extend(["-ar", str(sample_rate)])

    if channels in (1, 2):
        args.extend(["-ac", str(channels)])

    return args


def _validate_target(target_format: str) -> tuple[bool, str]:
    fmt = (target_format or "").strip().lower()
    if not fmt:
        return False, "target_format is required"
    if fmt not in SUPPORTED_OUTPUT_FORMATS:
        allowed = ", ".join(sorted(SUPPORTED_OUTPUT_FORMATS))
        return False, f"Unsupported target_format: {fmt}. Allowed output formats: {allowed}"
    return True, ""


def _validate_input_ext(input_file: str) -> tuple[bool, str]:
    ext = _ext(input_file)
    if not ext:
        return False, "Input file has no extension"
    if ext not in SUPPORTED_INPUT_FORMATS:
        allowed = ", ".join(sorted(SUPPORTED_INPUT_FORMATS))
        return False, f"Unsupported input format: .{ext}. Allowed input formats: {allowed}"
    if ext == "cda":
        return False, "CDA tracks are shortcut references and are not directly decodable as standalone files"
    return True, ""


def _apply_preset(
    preset: str,
    bitrate: str,
    sample_rate: int,
    channels: int,
) -> tuple[str, int, int, dict]:
    preset_name = (preset or "custom").strip().lower()
    if preset_name in {"", "custom"}:
        return bitrate, int(sample_rate or 0), int(channels or 0), {
            "preset": "custom",
            "bitrate": bitrate,
            "sample_rate": int(sample_rate or 0),
            "channels": int(channels or 0),
        }

    cfg = PRESET_CONFIGS.get(preset_name)
    if not cfg:
        allowed = ", ".join(["custom", *sorted(PRESET_CONFIGS.keys())])
        raise ValueError(f"Unsupported preset: {preset_name}. Allowed presets: {allowed}")

    return cfg["bitrate"], cfg["sample_rate"], cfg["channels"], {
        "preset": preset_name,
        **cfg,
    }


def _emit_stream_event(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    sys.stdout.flush()


def _pkcs7_unpad(data: bytes) -> bytes:
    if not data:
        raise ValueError("Invalid padded data")
    pad = data[-1]
    if pad < 1 or pad > 16:
        raise ValueError("Invalid PKCS7 padding")
    if data[-pad:] != bytes([pad]) * pad:
        raise ValueError("Invalid PKCS7 padding")
    return data[:-pad]


def _aes_ecb_decrypt(data: bytes, key: bytes) -> bytes:
    try:
        from Crypto.Cipher import AES
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'pycryptodome'. Install with: pip install pycryptodome"
        ) from exc

    cipher = AES.new(key, AES.MODE_ECB)
    return cipher.decrypt(data)


def _ensure_ncm_core_dependency() -> tuple[bool, str]:
    try:
        from Crypto.Cipher import AES  # noqa: F401
        return True, ""
    except ImportError:
        return False, "Missing dependency 'pycryptodome'. Install with: pip install pycryptodome"


def _normalize_ncm_target(target_format: str, source_format: str = "") -> tuple[bool, str, str]:
    fmt = (target_format or "").strip().lower()
    if not fmt:
        src = (source_format or "").strip().lower()
        fmt = src if src in NCM_OUTPUT_FORMATS else "mp3"
    if fmt not in NCM_OUTPUT_FORMATS:
        allowed = ", ".join(sorted(NCM_OUTPUT_FORMATS))
        return False, "", f"Unsupported target_format: {fmt}. Allowed NCM output formats: {allowed}"
    return True, fmt, ""


def _normalize_kgm_target(target_format: str, source_format: str = "") -> tuple[bool, str, str]:
    fmt = (target_format or "").strip().lower()
    if not fmt:
        src = (source_format or "").strip().lower()
        fmt = src if src in KGM_OUTPUT_FORMATS else "mp3"
    if fmt not in KGM_OUTPUT_FORMATS:
        allowed = ", ".join(sorted(KGM_OUTPUT_FORMATS))
        return False, "", f"Unsupported target_format: {fmt}. Allowed KGM output formats: {allowed}"
    return True, fmt, ""


def _infer_audio_format(audio_bytes: bytes, fallback: str = "") -> str:
    fmt = (fallback or "").strip().lower()
    if fmt in SUPPORTED_OUTPUT_FORMATS:
        return fmt
    if len(audio_bytes) >= 12 and audio_bytes[0:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
        return "wav"
    if audio_bytes.startswith(b"fLaC"):
        return "flac"
    if len(audio_bytes) >= 8 and audio_bytes[4:8] == b"ftyp":
        return "m4a"
    if audio_bytes.startswith(b"OggS"):
        return "ogg"
    if audio_bytes.startswith(b"ID3"):
        return "mp3"
    if len(audio_bytes) > 2 and audio_bytes[0] == 0xFF and (audio_bytes[1] & 0xE0) == 0xE0:
        return "mp3"
    return "mp3"


def _decode_ximalaya_table(encoded: str) -> tuple[int, ...]:
    raw = base64.b64decode(encoded)
    if len(raw) != 1024 * 2:
        raise ValueError("Invalid Ximalaya table length")
    table = struct.unpack("<1024H", raw)
    if len(set(table)) != 1024:
        raise ValueError("Invalid Ximalaya table permutation")
    return table


def _get_x2m_table() -> tuple[int, ...]:
    global _X2M_TABLE_CACHE
    if _X2M_TABLE_CACHE is None:
        _X2M_TABLE_CACHE = _decode_ximalaya_table(_X2M_SCRAMBLE_TABLE_B64)
    return _X2M_TABLE_CACHE


def _get_x3m_table() -> tuple[int, ...]:
    global _X3M_TABLE_CACHE
    if _X3M_TABLE_CACHE is None:
        _X3M_TABLE_CACHE = _decode_ximalaya_table(_X3M_SCRAMBLE_TABLE_B64)
    return _X3M_TABLE_CACHE


def _normalize_kwm_core_key(raw: str) -> bytes:
    text = str(raw or "").strip()
    if not text:
        raise ValueError("KWM core key is empty")

    if text.lower().startswith("hex:"):
        text = text[4:].strip()

    hex_chars = set("0123456789abcdefABCDEF")
    if len(text) == 64 and all(ch in hex_chars for ch in text):
        try:
            key = bytes.fromhex(text)
        except ValueError as exc:
            raise ValueError("Invalid KWM core key hex string") from exc
    else:
        key = text.encode("utf-8")

    if len(key) != 32:
        raise ValueError(
            f"Invalid KWM core key length: {len(key)} bytes (required: 32 bytes). "
            "Use a 32-char text key or 64-char hex key."
        )
    return key


def _decode_kwm_file(input_file: str, kwm_core_key: str = "") -> dict:
    ext = _ext(input_file)
    if ext not in KWM_PREFIXES:
        raise ValueError(f"Not a supported KWM format: .{ext}")

    try:
        from libtakiyasha.kwm import KWM, probe_kwm
    except ImportError:
        try:
            from libtakiyasha import KWM, probe_kwm
        except ImportError as exc:
            raise RuntimeError(
                "Missing dependency 'libtakiyasha'. Install with: pip install libtakiyasha"
            ) from exc

    filething_or_info = probe_kwm(input_file)
    key_text = str(kwm_core_key or "").strip()
    try:
        if key_text:
            crypter = KWM.open(filething_or_info, core_key=_normalize_kwm_core_key(key_text))
        else:
            crypter = KWM.open(filething_or_info)
    except TypeError as exc:
        msg = str(exc)
        if "argument 'core_key' is required to generate the master key" in msg:
            raise ValueError(
                "This .kwm file requires a KWM core key. "
                "Please fill 'KWM core key' in the unlock panel (32-char text or 64-char hex)."
            ) from exc
        raise

    audio_bytes = crypter.read()
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes),
        "metadata": {},
    }


def _decode_qmc_v1_file(input_file: str) -> dict:
    ext = _ext(input_file)
    if ext not in QMC_V1_PREFIXES and not ext.startswith("bkc"):
        raise ValueError(f"Not a supported QMCv1 format: .{ext}")

    try:
        from libtakiyasha.qmc import QMCv1, probe_qmcv1
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'libtakiyasha'. Install with: pip install libtakiyasha"
        ) from exc

    crypter = QMCv1.open(probe_qmcv1(input_file))
    audio_bytes = crypter.read()
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes),
        "metadata": {},
    }


def _decode_ncm_cache_file(input_file: str) -> dict:
    ext = _ext(input_file)
    if ext not in NCM_CACHE_PREFIXES:
        raise ValueError(f"Not a supported NCM cache format: .{ext}")

    buf = bytearray(Path(input_file).read_bytes())
    for i in range(len(buf)):
        buf[i] ^= 163

    audio_bytes = bytes(buf)
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes),
        "metadata": {},
    }


def _decode_tm_file(input_file: str) -> dict:
    ext = _ext(input_file)
    if ext not in TM_PREFIXES:
        raise ValueError(f"Not a supported TM format: .{ext}")

    buf = bytearray(Path(input_file).read_bytes())
    if len(buf) < len(TM_HEADER):
        raise ValueError("Invalid TM file: file too small")

    buf[: len(TM_HEADER)] = TM_HEADER
    audio_bytes = bytes(buf)
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes, "m4a"),
        "metadata": {},
    }


def _decode_xm_file(input_file: str) -> dict:
    ext = _ext(input_file)
    if ext not in XIAMI_PREFIXES:
        raise ValueError(f"Not a supported Xiami format: .{ext}")

    buf = bytearray(Path(input_file).read_bytes())
    if len(buf) < 0x10:
        raise ValueError("Invalid XM file: file too small")
    if not (buf[0:4] == b"ifmt" and buf[8:12] == b"\xFE\xFE\xFE\xFE"):
        raise ValueError("Invalid XM file header")

    data_offset = int(buf[0x0C]) | (int(buf[0x0D]) << 8) | (int(buf[0x0E]) << 16)
    if data_offset < 0x10 or data_offset > len(buf):
        raise ValueError("Invalid XM payload offset")

    key = int(buf[0x0F])
    for i in range(data_offset, len(buf)):
        buf[i] = ((buf[i] - key) & 0xFF) ^ 0xFF

    file_type = bytes(buf[4:8])
    file_type_map = {
        b" WAV": "wav",
        b"FLAC": "flac",
        b" MP3": "mp3",
        b" A4M": "m4a",
    }

    audio_bytes = bytes(buf[data_offset:])
    source_format = _infer_audio_format(audio_bytes, file_type_map.get(file_type, ""))
    return {
        "audio_bytes": audio_bytes,
        "source_format": source_format,
        "metadata": {},
    }


def _decode_ximalaya_file(input_file: str) -> dict:
    ext = _ext(input_file)
    if ext not in XIMALAYA_PREFIXES:
        raise ValueError(f"Not a supported Ximalaya format: .{ext}")

    buf = bytearray(Path(input_file).read_bytes())
    if len(buf) < 1024:
        raise ValueError("Invalid Ximalaya file: file too small")

    if ext == "x2m":
        table = _get_x2m_table()
        key = _X2M_KEY
    else:
        table = _get_x3m_table()
        key = _X3M_KEY

    header = bytes(buf[:1024])
    for i in range(1024):
        src = table[i]
        buf[i] = header[src] ^ key[i % len(key)]

    audio_bytes = bytes(buf)
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes, "m4a"),
        "metadata": {},
    }


def _is_upper_hex_char(ch: int) -> bool:
    return (0x30 <= ch <= 0x39) or (0x41 <= ch <= 0x46)


def _is_printable_ascii_char(ch: int) -> bool:
    return 0x20 <= ch <= 0x7E


def _decrypt_mg3d_segment(data: bytearray, key: bytes) -> None:
    seg_size = 0x20
    for i in range(len(data)):
        data[i] = (data[i] - key[i % seg_size]) & 0xFF


def _decode_mg3d_file(input_file: str) -> dict:
    ext = _ext(input_file)
    if ext not in MIGU_PREFIXES:
        raise ValueError(f"Not a supported Migu format: .{ext}")

    seg_size = 0x20
    buf = bytearray(Path(input_file).read_bytes())
    header = buf[:0x100]
    decryption_key: bytes | None = None

    for i in range(seg_size, seg_size * 20, seg_size):
        possible_key = bytes(buf[i: i + seg_size])
        if len(possible_key) < seg_size:
            break
        if not all(_is_upper_hex_char(ch) for ch in possible_key):
            continue

        temp_header = bytearray(header)
        _decrypt_mg3d_segment(temp_header, possible_key)
        if temp_header[:4] != b"RIFF" or temp_header[8:16] != b"WAVEfmt ":
            continue

        if len(temp_header) < 0x14:
            continue
        fmt_chunk_size = struct.unpack("<I", bytes(temp_header[0x10:0x14]))[0]
        if fmt_chunk_size not in {16, 18, 40}:
            continue

        first_chunk_offset = 0x14 + fmt_chunk_size
        if first_chunk_offset + 8 > len(temp_header):
            continue
        chunk_name = temp_header[first_chunk_offset:first_chunk_offset + 4]
        if not all(_is_printable_ascii_char(ch) for ch in chunk_name):
            continue

        first_chunk_size = struct.unpack("<I", bytes(temp_header[first_chunk_offset + 4:first_chunk_offset + 8]))[0]
        second_chunk_offset = first_chunk_offset + 8 + first_chunk_size
        if second_chunk_offset + 4 <= len(temp_header):
            second_chunk_name = temp_header[second_chunk_offset:second_chunk_offset + 4]
            if not all(_is_printable_ascii_char(ch) for ch in second_chunk_name):
                continue

        decryption_key = possible_key
        break

    if not decryption_key:
        raise ValueError("MG3D: no suitable key discovered")

    _decrypt_mg3d_segment(buf, decryption_key)
    audio_bytes = bytes(buf)
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes, "wav"),
        "metadata": {},
    }


def _decode_joox_file(input_file: str, joox_uuid: str = "") -> dict:
    ext = _ext(input_file)
    if ext not in JOOX_PREFIXES:
        raise ValueError(f"Not a supported JOOX format: .{ext}")

    uuid = (joox_uuid or "").strip()
    if not uuid or len(uuid) != 32:
        raise ValueError("JOOX .ofl_en requires a 32-char UUID (set in Settings and retry)")

    raw = Path(input_file).read_bytes()
    if len(raw) < 12 or raw[:4] != JOOX_V4_MAGIC:
        raise ValueError("Unsupported JOOX file: only E!04 (Joox v4) is currently supported")

    original_size = int.from_bytes(raw[4:12], byteorder="big", signed=False)
    encrypted_payload = raw[12:]
    if not encrypted_payload:
        raise ValueError("Invalid JOOX file: missing encrypted payload")

    # Follows unlock-music joox-crypto: PBKDF2-HMAC-SHA1(uuid, salt, 1000, 16)
    aes_key = hashlib.pbkdf2_hmac(
        "sha1",
        uuid.encode("utf-8"),
        JOOX_SALT,
        1000,
        dklen=16,
    )

    chunks: list[bytes] = []
    for offset in range(0, len(encrypted_payload), JOOX_CHUNK_SIZE):
        block = encrypted_payload[offset: offset + JOOX_CHUNK_SIZE]
        if len(block) % 16 != 0:
            raise ValueError("Invalid JOOX payload: encrypted chunk is not AES block-aligned")
        plain = _aes_ecb_decrypt(block, aes_key)
        chunks.append(_pkcs7_unpad(plain))

    audio_bytes = b"".join(chunks)
    if 0 < original_size <= len(audio_bytes):
        audio_bytes = audio_bytes[:original_size]

    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes, "m4a"),
        "metadata": {},
    }


def _decode_key_material(value: str, expected_len: int | None = None) -> bytes:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("empty key material")

    if raw.startswith("hex:"):
        data = bytes.fromhex(raw[4:])
    elif raw.startswith("base64:"):
        data = base64.b64decode(raw[7:])
    else:
        compact_hex = "".join(raw.split())
        if all(ch in "0123456789abcdefABCDEF" for ch in compact_hex) and len(compact_hex) % 2 == 0:
            data = bytes.fromhex(compact_hex)
        else:
            data = raw.encode("latin1")

    if expected_len is not None and len(data) != expected_len:
        raise ValueError(f"invalid key length: expected {expected_len}, got {len(data)}")
    return data


def _load_kgm_tables() -> tuple[bytes, bytes, bytes, bytes | None]:
    config_path = None
    for candidate in KGM_TABLE_CONFIG_CANDIDATES:
        if candidate.exists():
            config_path = candidate
            break

    if config_path is None:
        raise RuntimeError(
            "Missing KGM table config. Please provide tootls/kgm_tables.json with table1/table2/tablev2 (hex or base64)."
        )

    payload = json.loads(config_path.read_text(encoding="utf-8"))
    table1 = _decode_key_material(str(payload.get("table1", "")), expected_len=272)
    table2 = _decode_key_material(str(payload.get("table2", "")), expected_len=272)
    tablev2 = _decode_key_material(str(payload.get("tablev2", "")), expected_len=272)

    vpr_key = payload.get("vpr_key")
    parsed_vpr_key = None
    if isinstance(vpr_key, str) and vpr_key.strip():
        parsed_vpr_key = _decode_key_material(vpr_key, expected_len=17)

    return table1, table2, tablev2, parsed_vpr_key


def _aes_cbc_decrypt_nopad(ciphertext: bytes, key: bytes, iv: bytes) -> bytes:
    try:
        from Crypto.Cipher import AES
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'pycryptodome'. Install with: pip install pycryptodome"
        ) from exc

    if len(ciphertext) % 16 != 0:
        raise ValueError("invalid AES-CBC cipher length")
    return AES.new(key, AES.MODE_CBC, iv).decrypt(ciphertext)


def _kgg_be_read64(block: bytes) -> int:
    return int.from_bytes(block[:8], "big")


def _kgg_be_write64(value: int) -> bytes:
    return (value & 0xFFFFFFFFFFFFFFFF).to_bytes(8, "big")


def _kgg_tea_single_round(v: int, total: int, k1: int, k2: int) -> int:
    return (((v << 4) + k1) ^ (v + total) ^ ((v >> 5) + k2)) & 0xFFFFFFFF


def _kgg_tea_ecb_decrypt(v: int, key_words: tuple[int, int, int, int]) -> int:
    y = (v >> 32) & 0xFFFFFFFF
    z = v & 0xFFFFFFFF
    total = 0
    for _ in range(16):
        total = (total + 0x9E3779B9) & 0xFFFFFFFF
    for _ in range(16):
        z = (z - _kgg_tea_single_round(y, total, key_words[2], key_words[3])) & 0xFFFFFFFF
        y = (y - _kgg_tea_single_round(z, total, key_words[0], key_words[1])) & 0xFFFFFFFF
        total = (total - 0x9E3779B9) & 0xFFFFFFFF
    return ((y & 0xFFFFFFFF) << 32) | (z & 0xFFFFFFFF)


def _kgg_tea_decrypt_round(block8: bytes, iv1: int, iv2: int, key_words: tuple[int, int, int, int]) -> tuple[bytes, int, int]:
    iv1_next = _kgg_be_read64(block8)
    iv2_next = _kgg_tea_ecb_decrypt(iv1_next ^ iv2, key_words)
    plain = iv2_next ^ iv1
    return _kgg_be_write64(plain), iv1_next, iv2_next


def _kgg_tea_cbc_decrypt(ciphertext: bytes, key_words_or_bytes: tuple[int, int, int, int] | bytes) -> bytes:
    if len(ciphertext) % 8 != 0 or len(ciphertext) < 16:
        return b""

    if isinstance(key_words_or_bytes, bytes):
        if len(key_words_or_bytes) != 16:
            return b""
        key_words = (
            int.from_bytes(key_words_or_bytes[0:4], "big"),
            int.from_bytes(key_words_or_bytes[4:8], "big"),
            int.from_bytes(key_words_or_bytes[8:12], "big"),
            int.from_bytes(key_words_or_bytes[12:16], "big"),
        )
    else:
        key_words = key_words_or_bytes

    iv1 = 0
    iv2 = 0
    header = bytearray(16)
    part, iv1, iv2 = _kgg_tea_decrypt_round(ciphertext[0:8], iv1, iv2, key_words)
    header[0:8] = part
    part, iv1, iv2 = _kgg_tea_decrypt_round(ciphertext[8:16], iv1, iv2, key_words)
    header[8:16] = part

    hdr_skip = 1 + (header[0] & 7) + 2
    real_plain = len(ciphertext) - hdr_skip - 7
    if real_plain < 0:
        return b""

    result = bytearray(real_plain)
    copy_len = min(real_plain, 16 - hdr_skip)
    if copy_len > 0:
        result[0:copy_len] = header[hdr_skip:hdr_skip + copy_len]

    p = copy_len
    in_data = memoryview(ciphertext)[16:]
    for _ in range(len(ciphertext) - 24, 0, -8):
        if p + 8 > real_plain:
            break
        part, iv1, iv2 = _kgg_tea_decrypt_round(bytes(in_data[0:8]), iv1, iv2, key_words)
        result[p:p + 8] = part
        in_data = in_data[8:]
        p += 8

    if p < real_plain and len(in_data) >= 8:
        part, iv1, iv2 = _kgg_tea_decrypt_round(bytes(in_data[0:8]), iv1, iv2, key_words)
        header[8:16] = part
        result[p] = header[8]

    return bytes(result)


def _kgg_decrypt_ekey_v1(ekey: str) -> bytes:
    try:
        raw = base64.b64decode(ekey)
    except Exception:
        return b""

    if len(raw) < 8:
        return b""

    key_words = (
        0x69005600 | (raw[0] << 16) | raw[1],
        0x46003800 | (raw[2] << 16) | raw[3],
        0x2B002000 | (raw[4] << 16) | raw[5],
        0x15000B00 | (raw[6] << 16) | raw[7],
    )
    dec = _kgg_tea_cbc_decrypt(raw[8:], key_words)
    if not dec:
        return b""

    return raw[:8] + dec


def _kgg_decrypt_ekey(ekey: str) -> bytes:
    text = (ekey or "").strip()
    if text.startswith(KGG_EKEY_V2_PREFIX):
        stage = text[len(KGG_EKEY_V2_PREFIX):].encode("utf-8", errors="ignore")
        stage = _kgg_tea_cbc_decrypt(stage, KGG_EKEY_V2_KEY1)
        stage = _kgg_tea_cbc_decrypt(stage, KGG_EKEY_V2_KEY2)
        return _kgg_decrypt_ekey_v1(stage.decode("utf-8", errors="ignore"))
    return _kgg_decrypt_ekey_v1(text)


def _kgg_build_map_key(key: bytes) -> bytes:
    n = len(key)
    if n <= 0:
        raise ValueError("invalid decrypted KGG key")
    out = bytearray(128)
    for i in range(128):
        j = (i * i + 71214) % n
        shift = (j + 4) % 8
        value = key[j]
        out[i] = ((value << shift) | (value >> (8 - shift))) & 0xFF
    return bytes(out)


def _kgg_rc4_hash(key: bytes) -> float:
    h = 1
    for b in key:
        if b == 0:
            continue
        next_h = (h * b) & 0xFFFFFFFF
        if next_h <= h:
            break
        h = next_h
    return float(h)


def _kgg_get_segment_key(hash_value: float, segment_id: int, seed: int) -> int:
    if seed == 0:
        return 0
    return int((hash_value / (float(seed) * float(segment_id + 1))) * 100.0)


def _kgg_rc4_keystream(key: bytes, size: int) -> bytes:
    n = len(key)
    s = [i for i in range(n)]
    j = 0
    for i in range(n):
        j = (j + s[i] + key[i]) % n
        s[i], s[j] = s[j], s[i]

    i = 0
    j = 0
    out = bytearray(size)
    for k in range(size):
        i = (i + 1) % n
        j = (j + s[i]) % n
        s[i], s[j] = s[j], s[i]
        out[k] ^= s[(s[i] + s[j]) % n]
    return bytes(out)


def _kgg_decrypt_payload(encrypted_payload: bytes, decrypted_key: bytes) -> bytes:
    key_len = len(decrypted_key)
    if key_len == 0:
        raise ValueError("Invalid KGG ekey after decrypt")

    out = bytearray(encrypted_payload)
    if key_len < 300:
        map_key = _kgg_build_map_key(decrypted_key)
        offset = 0
        for idx in range(len(out)):
            mapped = offset if offset <= 0x7FFF else (offset % 0x7FFF)
            out[idx] ^= map_key[mapped % len(map_key)]
            offset += 1
        return bytes(out)

    hash_value = _kgg_rc4_hash(decrypted_key)
    key_stream = _kgg_rc4_keystream(decrypted_key, 0x1400 + 512)

    offset = 0
    size = len(out)
    # First segment [0, 0x80)
    while offset < size and offset < 0x80:
        key_idx = offset % key_len
        idx = _kgg_get_segment_key(hash_value, offset, decrypted_key[key_idx]) % key_len
        out[offset] ^= decrypted_key[idx]
        offset += 1

    while offset < size:
        seg_idx = offset // 0x1400
        seg_off = offset % 0x1400
        skip = _kgg_get_segment_key(hash_value, seg_idx, decrypted_key[seg_idx % key_len]) & 0x1FF
        process = min(size - offset, 0x1400 - seg_off)
        stream_start = skip + seg_off
        stream_end = stream_start + process
        stream = key_stream[stream_start:stream_end]
        for i in range(process):
            out[offset + i] ^= stream[i]
        offset += process

    return bytes(out)


def _kgg_is_valid_page1_header(page1: bytes) -> bool:
    if len(page1) < 24:
        return False
    o10 = int.from_bytes(page1[16:20], "little")
    o14 = int.from_bytes(page1[20:24], "little")
    v6 = ((o10 & 0xFF) << 8) | ((o10 & 0xFF00) << 16)
    return o14 == 0x20204000 and (v6 - 0x200 <= 0xFE00) and ((v6 & (v6 - 1)) == 0)


def _kgg_derive_db_page_key(page_no: int) -> tuple[bytes, bytes]:
    buf = bytearray(24)
    buf[:16] = KGG_DB_DEFAULT_MASTER_KEY
    buf[16:20] = int(page_no).to_bytes(4, "little")
    buf[20:24] = (0x546C4173).to_bytes(4, "little")

    aes_key = hashlib.md5(bytes(buf)).digest()

    ebx = (page_no + 1) & 0xFFFFFFFF
    for i in range(0, 16, 4):
        quotient = ebx // 0xCE26
        eax = (0x7FFFFF07 * quotient) & 0xFFFFFFFF
        ecx = (0x9EF4 * ebx - eax) & 0xFFFFFFFF
        if ecx & 0x80000000:
            ecx = (ecx + 0x7FFFFF07) & 0xFFFFFFFF
        ebx = ecx
        buf[i:i + 4] = ebx.to_bytes(4, "little")

    aes_iv = hashlib.md5(bytes(buf[:16])).digest()
    return aes_key, aes_iv


def _kgg_decrypt_db_to_sqlite(db_path: str) -> str:
    page_size = 1024
    src = Path(db_path)
    if not src.exists():
        raise FileNotFoundError(f"KGMusicV3.db not found: {db_path}")

    raw = src.read_bytes()
    if len(raw) % page_size != 0:
        raise ValueError("invalid KGMusicV3.db size")

    temp_file = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    temp_file_path = temp_file.name
    temp_file.close()

    try:
        with open(temp_file_path, "wb") as out:
            page_count = len(raw) // page_size
            for page_index in range(page_count):
                page_no = page_index + 1
                page = bytearray(raw[page_index * page_size:(page_index + 1) * page_size])
                key, iv = _kgg_derive_db_page_key(page_no)

                if page_no == 1:
                    if bytes(page[:16]) == KGG_SQLITE_HEADER:
                        out.write(raw)
                        return temp_file_path

                    if not _kgg_is_valid_page1_header(page):
                        raise ValueError("invalid KGMusicV3.db page1 header")

                    page[16:24] = page[8:16]
                    plain = _aes_cbc_decrypt_nopad(bytes(page[16:]), key, iv)
                    out.write(KGG_SQLITE_HEADER)
                    out.write(plain)
                else:
                    plain = _aes_cbc_decrypt_nopad(bytes(page), key, iv)
                    out.write(plain)
        return temp_file_path
    except Exception:
        try:
            os.remove(temp_file_path)
        except OSError:
            pass
        raise


def _kgg_read_key_map_from_file(key_file: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for line in Path(key_file).read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip() or "$" not in line:
            continue
        key_id, ekey = line.split("$", 1)
        key_id = key_id.strip()
        ekey = ekey.strip()
        if key_id and ekey:
            mapping[key_id] = ekey
    return mapping


def _kgg_read_key_map_from_db(db_path: str) -> dict[str, str]:
    sqlite_path = _kgg_decrypt_db_to_sqlite(db_path)
    try:
        conn = sqlite3.connect(sqlite_path)
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT EncryptionKeyId, EncryptionKey "
                "FROM ShareFileItems "
                "WHERE EncryptionKeyId IS NOT NULL AND EncryptionKeyId != '' "
                "AND EncryptionKey IS NOT NULL AND EncryptionKey != ''"
            )
            result: dict[str, str] = {}
            for key_id, ekey in cur.fetchall():
                if key_id and ekey:
                    result[str(key_id)] = str(ekey)
            return result
        finally:
            conn.close()
    finally:
        try:
            os.remove(sqlite_path)
        except OSError:
            pass


def _kgg_candidate_key_paths(
    input_file: str,
    explicit_key_file: str = "",
    explicit_db_file: str = "",
) -> tuple[list[str], list[str]]:
    input_path = Path(input_file).resolve()
    cwd = Path.cwd()
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent

    key_candidates = [
        str(Path(explicit_key_file).resolve()) if explicit_key_file.strip() else "",
        str((input_path.parent / "kgg.key").resolve()),
        str((input_path.parent / "tootls" / "kgg.key").resolve()),
        str((cwd / "tootls" / "kgg.key").resolve()),
        str((cwd / "tools" / "kgg.key").resolve()),
        str((script_dir / "tootls" / "kgg.key").resolve()),
        str((root_dir / "tootls" / "kgg.key").resolve()),
    ]
    db_candidates = [
        str(Path(explicit_db_file).resolve()) if explicit_db_file.strip() else "",
        str((input_path.parent / "KGMusicV3.db").resolve()),
        str((input_path.parent / "tootls" / "KGMusicV3.db").resolve()),
        str((cwd / "tootls" / "KGMusicV3.db").resolve()),
        str((cwd / "tools" / "KGMusicV3.db").resolve()),
        str((script_dir / "tootls" / "KGMusicV3.db").resolve()),
        str((root_dir / "tootls" / "KGMusicV3.db").resolve()),
    ]

    # Keep order but remove duplicates.
    key_paths = [p for p in dict.fromkeys(key_candidates) if p]
    db_paths = [p for p in dict.fromkeys(db_candidates) if p]
    return key_paths, db_paths


def _kgg_load_key_map(
    input_file: str,
    explicit_key_file: str = "",
    explicit_db_file: str = "",
) -> tuple[dict[str, str], str, list[str]]:
    global _KGG_KEY_MAP_CACHE, _KGG_KEY_SOURCE_CACHE

    key_paths, db_paths = _kgg_candidate_key_paths(
        input_file,
        explicit_key_file=explicit_key_file,
        explicit_db_file=explicit_db_file,
    )
    searched = key_paths + db_paths

    has_explicit = bool(explicit_key_file.strip() or explicit_db_file.strip())

    if _KGG_KEY_MAP_CACHE and not has_explicit:
        return _KGG_KEY_MAP_CACHE, _KGG_KEY_SOURCE_CACHE, searched

    for key_path in key_paths:
        if Path(key_path).exists():
            mapping = _kgg_read_key_map_from_file(key_path)
            if mapping:
                source = f"kgg.key:{key_path}"
                if not has_explicit:
                    _KGG_KEY_MAP_CACHE = mapping
                    _KGG_KEY_SOURCE_CACHE = source
                return mapping, source, searched

    for db_path in db_paths:
        if Path(db_path).exists():
            mapping = _kgg_read_key_map_from_db(db_path)
            if mapping:
                source = f"KGMusicV3.db:{db_path}"
                if not has_explicit:
                    _KGG_KEY_MAP_CACHE = mapping
                    _KGG_KEY_SOURCE_CACHE = source
                return mapping, source, searched

    return {}, "", searched


def _decode_kgg_with_external_keys(
    input_file: str,
    kgg_key_file: str = "",
    kg_db_file: str = "",
) -> dict:
    with open(input_file, "rb") as f:
        f.seek(16)
        header = f.read(8)
        if len(header) != 8:
            raise ValueError("Invalid KGG header")

        header_len = int.from_bytes(header[:4], "little")
        mode = int.from_bytes(header[4:8], "little")
        if mode != 5:
            raise ValueError(f"Unsupported KGG mode: {mode}")

        f.seek(68)
        hash_len_raw = f.read(4)
        if len(hash_len_raw) != 4:
            raise ValueError("Invalid KGG audio hash header")
        hash_len = int.from_bytes(hash_len_raw, "little")
        audio_hash_raw = f.read(hash_len)
        if len(audio_hash_raw) != hash_len:
            raise ValueError("Invalid KGG audio hash")
        audio_hash = audio_hash_raw.decode("latin1", errors="ignore")

        mapping, source_desc, searched_paths = _kgg_load_key_map(
            input_file,
            explicit_key_file=kgg_key_file,
            explicit_db_file=kg_db_file,
        )
        ekey = mapping.get(audio_hash)
        if not ekey:
            raise ValueError(
                "KGG key not found for audio hash: "
                f"{audio_hash}. Please provide kgg.key or KGMusicV3.db. "
                f"Searched: {', '.join(searched_paths)}"
            )

        decrypted_key = _kgg_decrypt_ekey(ekey)
        if not decrypted_key:
            raise ValueError("Failed to decrypt KGG ekey from key provider")

        f.seek(header_len)
        encrypted_payload = f.read()
        audio_bytes = _kgg_decrypt_payload(encrypted_payload, decrypted_key)

        return {
            "audio_bytes": audio_bytes,
            "source_format": _infer_audio_format(audio_bytes),
            "metadata": {
                "audio_hash": audio_hash,
                "key_source": source_desc,
            },
        }


def _decode_kgm_file(input_file: str, kgg_key_file: str = "", kg_db_file: str = "") -> dict:
    ext = _ext(input_file)
    if ext not in KGM_PREFIXES:
        raise ValueError("Input file must be .kgm, .kgma, .vpr, or .kgg")

    if ext in {"kgm", "kgma", "vpr"}:
        try:
            from libtakiyasha import KGMorVPR, probe_kgmvpr
        except ImportError as exc:
            raise RuntimeError(
                "Missing dependency 'libtakiyasha'. Install with: pip install libtakiyasha"
            ) from exc

        table1, table2, tablev2, vpr_key = _load_kgm_tables()
        filething_or_info = probe_kgmvpr(input_file)
        crypter = KGMorVPR.open(
            filething_or_info,
            table1=table1,
            table2=table2,
            tablev2=tablev2,
            vpr_key=vpr_key,
        )
        audio_bytes = crypter.read()
        return {
            "audio_bytes": audio_bytes,
            "source_format": _infer_audio_format(audio_bytes),
            "metadata": {},
        }

    try:
        from libtakiyasha.qmc import QMCv2, probe_qmcv2
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'libtakiyasha'. Install with: pip install libtakiyasha"
        ) from exc

    try:
        filething_or_info = probe_qmcv2(input_file)
        _, info = filething_or_info
        if info is not None:
            crypter = QMCv2.open(filething_or_info)
            audio_bytes = crypter.read()
            return {
                "audio_bytes": audio_bytes,
                "source_format": _infer_audio_format(audio_bytes),
                "metadata": {"key_source": "embedded"},
            }
    except Exception:
        # Fall back to external key providers for non-embedded-key KGG variants.
        pass

    return _decode_kgg_with_external_keys(
        input_file,
        kgg_key_file=kgg_key_file,
        kg_db_file=kg_db_file,
    )


def _decode_ncm_file(input_file: str) -> dict:
    with open(input_file, "rb") as f:
        header = f.read(8)
        if header != NCM_HEADER:
            raise ValueError("Invalid NCM file header")

        f.seek(2, os.SEEK_CUR)

        key_len_raw = f.read(4)
        if len(key_len_raw) != 4:
            raise ValueError("Invalid NCM key block")
        key_len = struct.unpack("<I", key_len_raw)[0]
        key_data = bytearray(f.read(key_len))
        for i in range(len(key_data)):
            key_data[i] ^= 0x64

        key_plain = _pkcs7_unpad(_aes_ecb_decrypt(bytes(key_data), NCM_CORE_KEY))
        if len(key_plain) <= 17:
            raise ValueError("Invalid NCM key data")
        key_material = key_plain[17:]

        key_box = bytearray(range(256))
        c = 0
        key_len_mod = len(key_material)
        if key_len_mod == 0:
            raise ValueError("Invalid NCM key material")
        for i in range(256):
            swap = key_box[i]
            c = (swap + c + key_material[i % key_len_mod]) & 0xFF
            key_box[i] = key_box[c]
            key_box[c] = swap

        meta_len_raw = f.read(4)
        if len(meta_len_raw) != 4:
            raise ValueError("Invalid NCM metadata block")
        meta_len = struct.unpack("<I", meta_len_raw)[0]

        metadata = {}
        if meta_len > 0:
            meta_data = bytearray(f.read(meta_len))
            for i in range(len(meta_data)):
                meta_data[i] ^= 0x63
            try:
                decoded_meta = base64.b64decode(bytes(meta_data)[22:])
                meta_plain = _pkcs7_unpad(_aes_ecb_decrypt(decoded_meta, NCM_META_KEY))
                if meta_plain.startswith(b"music:"):
                    meta_plain = meta_plain[6:]
                metadata = json.loads(meta_plain.decode("utf-8", errors="ignore"))
            except Exception:
                metadata = {}

        f.seek(4, os.SEEK_CUR)
        f.seek(5, os.SEEK_CUR)

        image_len_raw = f.read(4)
        if len(image_len_raw) != 4:
            raise ValueError("Invalid NCM image block")
        image_len = struct.unpack("<I", image_len_raw)[0]
        image_data = f.read(image_len) if image_len > 0 else b""

        encrypted_audio = bytearray(f.read())
        for i in range(len(encrypted_audio)):
            j = (i + 1) & 0xFF
            encrypted_audio[i] ^= key_box[(key_box[j] + key_box[(key_box[j] + j) & 0xFF]) & 0xFF]

    source_format = _infer_audio_format(bytes(encrypted_audio), str(metadata.get("format", "")))
    return {
        "audio_bytes": bytes(encrypted_audio),
        "source_format": source_format,
        "metadata": metadata,
        "cover_data": image_data,
    }


def _apply_ncm_metadata(output_file: str, target_format: str, metadata: dict, cover_data: bytes) -> list[str]:
    warnings = []
    if target_format not in {"mp3", "flac"}:
        return warnings

    title = metadata.get("musicName")
    album = metadata.get("album")
    artist_data = metadata.get("artist") or []
    artists = [a[0] for a in artist_data if isinstance(a, list) and a and a[0]]

    try:
        if target_format == "mp3":
            from mutagen.easyid3 import EasyID3
            from mutagen.id3 import APIC, ID3
            from mutagen.mp3 import MP3

            try:
                easy = EasyID3(output_file)
            except Exception:
                audio = MP3(output_file, ID3=ID3)
                if audio.tags is None:
                    audio.add_tags()
                audio.save()
                easy = EasyID3(output_file)

            if title:
                easy["title"] = [str(title)]
            if album:
                easy["album"] = [str(album)]
            if artists:
                easy["artist"] = [", ".join(str(a) for a in artists)]
            easy.save()

            if cover_data:
                mime = "image/jpeg"
                if cover_data.startswith(b"\x89PNG\r\n\x1a\n"):
                    mime = "image/png"
                audio = MP3(output_file, ID3=ID3)
                if audio.tags is None:
                    audio.add_tags()
                for key in list(audio.tags.keys()):
                    if str(key).startswith("APIC"):
                        del audio.tags[key]
                audio.tags.add(APIC(encoding=3, mime=mime, type=3, desc="Cover", data=cover_data))
                audio.save()

        elif target_format == "flac":
            from mutagen.flac import FLAC, Picture

            flac = FLAC(output_file)
            if title:
                flac["title"] = [str(title)]
            if album:
                flac["album"] = [str(album)]
            if artists:
                flac["artist"] = [", ".join(str(a) for a in artists)]

            if cover_data:
                mime = "image/jpeg"
                if cover_data.startswith(b"\x89PNG\r\n\x1a\n"):
                    mime = "image/png"
                picture = Picture()
                picture.data = cover_data
                picture.type = 3
                picture.mime = mime
                flac.add_picture(picture)

            flac.save()
    except ImportError:
        warnings.append("mutagen is not installed, metadata tags were skipped")
    except Exception as exc:
        warnings.append(f"Failed to write metadata: {exc}")

    return warnings


def convert_audio(
    input_file: str,
    target_format: str,
    output_file: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
    preset: str = "custom",
) -> dict:
    """Convert one media file to a target audio format."""
    try:
        ffmpeg_bin, ffprobe_bin = _ensure_ffmpeg_tools()
        if not ffmpeg_bin:
            return {
                "success": False,
                "error": "ffmpeg not found. Install with: sudo apt install ffmpeg",
            }

        ok, err = _validate_target(target_format)
        if not ok:
            return {"success": False, "error": err}

        bitrate, sample_rate, channels, config_applied = _apply_preset(
            preset,
            bitrate,
            sample_rate,
            channels,
        )

        input_file = resolve_input_path(input_file, __file__)
        if not os.path.exists(input_file):
            return {
                "success": False,
                "error": f"Input file not found: {input_file}. Please select files using native file picker so absolute paths are available.",
            }

        ok, err = _validate_input_ext(input_file)
        if not ok:
            return {"success": False, "error": err}

        ok, err = _validate_audio_stream_exists(input_file, ffprobe_bin)
        if not ok:
            return {"success": False, "error": err}

        target_format = target_format.strip().lower()

        if output_file and str(output_file).strip():
            output_file = resolve_output_file(output_file, __file__)
        else:
            output_file = str(Path(input_file).with_suffix(f".{target_format}"))

        output_file = _unique_path(output_file)
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            input_file,
            "-vn",
        ]
        cmd.extend(_codec_args_for(target_format, bitrate, int(sample_rate or 0), int(channels or 0)))
        cmd.append(output_file)

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0 or not os.path.exists(output_file):
            detail = (result.stderr or result.stdout or "Unknown ffmpeg error").strip()
            return {
                "success": False,
                "error": f"ffmpeg conversion failed: {detail}",
            }

        return {
            "success": True,
            "output": output_file,
            "target_format": target_format,
            "config_applied": config_applied,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def convert_audio_batch(
    input_files: list,
    target_format: str,
    output_dir: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
    preset: str = "custom",
) -> dict:
    """Convert multiple media files to one target audio format."""
    try:
        if not input_files:
            return {"success": False, "error": "No input files provided"}

        ok, err = _validate_target(target_format)
        if not ok:
            return {"success": False, "error": err}

        bitrate, sample_rate, channels, config_applied = _apply_preset(
            preset,
            bitrate,
            sample_rate,
            channels,
        )

        resolved_inputs = []
        for raw in input_files:
            resolved = resolve_input_path(str(raw), __file__)
            if not os.path.exists(resolved):
                return {
                    "success": False,
                    "error": f"Input file not found: {resolved}. Please select files using native file picker so absolute paths are available.",
                }
            resolved_inputs.append(resolved)

        if output_dir and str(output_dir).strip():
            output_dir = resolve_output_dir(output_dir, __file__)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        else:
            output_dir = create_unique_child_dir(resolved_inputs[0], f"audio_{target_format}")

        outputs = []
        errors = []

        for input_path in resolved_inputs:
            ok, err = _validate_input_ext(input_path)
            if not ok:
                errors.append({"input": input_path, "error": err})
                continue

            planned_output = _build_default_output(input_path, output_dir, target_format)
            planned_output = _unique_path(planned_output)

            result = convert_audio(
                input_file=input_path,
                target_format=target_format,
                output_file=planned_output,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
            )
            if result.get("success"):
                outputs.append(result.get("output"))
            else:
                errors.append({"input": input_path, "error": result.get("error", "Unknown conversion error")})

        return {
            "success": len(outputs) > 0,
            "output": output_dir,
            "outputs": outputs,
            "success_count": len(outputs),
            "fail_count": len(errors),
            "errors": errors,
            "config_applied": config_applied,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def convert_audio_batch_stream(
    input_files: list,
    target_format: str,
    output_dir: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
    preset: str = "custom",
) -> dict:
    """Stream per-file progress events for batch conversion."""
    try:
        if not input_files:
            _emit_stream_event({"type": "error", "error": "No input files provided"})
            return {"success": False, "error": "No input files provided"}

        ffmpeg_bin, _ = _ensure_ffmpeg_tools()
        if not ffmpeg_bin:
            msg = "ffmpeg not found. Install with: sudo apt install ffmpeg"
            _emit_stream_event({"type": "error", "error": msg})
            return {"success": False, "error": msg}

        ok, err = _validate_target(target_format)
        if not ok:
            _emit_stream_event({"type": "error", "error": err})
            return {"success": False, "error": err}

        bitrate, sample_rate, channels, config_applied = _apply_preset(
            preset,
            bitrate,
            sample_rate,
            channels,
        )

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

        if output_dir and str(output_dir).strip():
            output_dir = resolve_output_dir(output_dir, __file__)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        elif resolved_inputs:
            output_dir = create_unique_child_dir(resolved_inputs[0], f"audio_{target_format}")
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
            "config_applied": config_applied,
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

            planned_output = _build_default_output(input_path, output_dir, target_format)
            planned_output = _unique_path(planned_output)

            result = convert_audio(
                input_file=input_path,
                target_format=target_format,
                output_file=planned_output,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
                preset="custom",
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
            "config_applied": config_applied,
        }
        _emit_stream_event(final_payload)
        return final_payload
    except Exception as e:
        _emit_stream_event({"type": "error", "error": str(e)})
        return {"success": False, "error": str(e)}


def probe_media(input_file: str) -> dict:
    """Get media info via ffprobe."""
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
        return {"success": True, "info": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


def supported_audio_formats() -> dict:
    """Return allowed input/output formats for frontend display."""
    return {
        "success": True,
        "input_formats": sorted(SUPPORTED_INPUT_FORMATS),
        "output_formats": sorted(SUPPORTED_OUTPUT_FORMATS),
    }


def ncm_to_audio(
    input_file: str,
    target_format: str = "",
    output_file: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
) -> dict:
    """Decode one NCM file and optionally transcode to target audio format."""
    temp_input = ""
    try:
        ok, err = _ensure_ncm_core_dependency()
        if not ok:
            return {"success": False, "error": err}

        input_file = resolve_input_path(input_file, __file__)
        if not os.path.exists(input_file):
            return {"success": False, "error": f"Input file not found: {input_file}"}

        if _ext(input_file) != NCM_PREFIX:
            return {"success": False, "error": "Input file must be a .ncm file"}

        decoded = _decode_ncm_file(input_file)
        audio_bytes = decoded["audio_bytes"]
        source_format = decoded["source_format"]
        metadata = decoded.get("metadata") or {}
        cover_data = decoded.get("cover_data") or b""

        ok, final_format, err = _normalize_ncm_target(target_format, source_format)
        if not ok:
            return {"success": False, "error": err}

        if output_file and str(output_file).strip():
            output_file = resolve_output_file(output_file, __file__)
        else:
            output_file = str(Path(input_file).with_suffix(f".{final_format}"))

        output_file = _unique_path(output_file)
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)

        if final_format == source_format:
            Path(output_file).write_bytes(audio_bytes)
        else:
            with tempfile.NamedTemporaryFile(suffix=f".{source_format}", delete=False) as tmp:
                tmp.write(audio_bytes)
                temp_input = tmp.name

            converted = convert_audio(
                input_file=temp_input,
                target_format=final_format,
                output_file=output_file,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
                preset="custom",
            )
            if not converted.get("success"):
                return converted
            output_file = str(converted.get("output"))

        warnings = _apply_ncm_metadata(output_file, final_format, metadata, cover_data)

        payload = {
            "success": True,
            "output": output_file,
            "source_format": source_format,
            "target_format": final_format,
        }
        if warnings:
            payload["warnings"] = warnings
        return payload
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    finally:
        if temp_input:
            try:
                os.remove(temp_input)
            except OSError:
                pass


def ncm_to_audio_batch_stream(
    input_files: list,
    target_format: str = "mp3",
    output_dir: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
) -> dict:
    """Decode NCM files in batch and stream per-file progress events."""
    try:
        if not input_files:
            _emit_stream_event({"type": "error", "error": "No input files provided"})
            return {"success": False, "error": "No input files provided"}

        ok, err = _ensure_ncm_core_dependency()
        if not ok:
            _emit_stream_event({"type": "error", "error": err})
            return {"success": False, "error": err}

        ok, final_format, err = _normalize_ncm_target(target_format)
        if not ok:
            msg = err
            _emit_stream_event({"type": "error", "error": msg})
            return {"success": False, "error": msg}

        resolved_paths = [resolve_input_path(str(raw), __file__) for raw in input_files]
        valid_inputs = [p for p in resolved_paths if os.path.exists(p) and _ext(p) == NCM_PREFIX]

        if output_dir and str(output_dir).strip():
            output_dir = resolve_output_dir(output_dir, __file__)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        elif valid_inputs:
            output_dir = create_unique_child_dir(valid_inputs[0], f"ncm_{final_format}")
        else:
            output_dir = ""

        outputs = []
        errors = []
        total = len(input_files)
        success_count = 0
        fail_count = 0

        _emit_stream_event({
            "type": "start",
            "total": total,
            "success_count": success_count,
            "fail_count": fail_count,
            "output": output_dir,
        })

        for index, input_path in enumerate(resolved_paths, start=1):
            if not os.path.exists(input_path):
                fail_count += 1
                msg = f"Input file not found: {input_path}"
                errors.append({"input": input_path, "error": msg})
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "success": False,
                    "error": msg,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })
                continue

            if _ext(input_path) != NCM_PREFIX:
                fail_count += 1
                msg = "Input file must be a .ncm file"
                errors.append({"input": input_path, "error": msg})
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "success": False,
                    "error": msg,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })
                continue

            planned_output = _unique_path(_build_default_output(input_path, output_dir, final_format))

            result = ncm_to_audio(
                input_file=input_path,
                target_format=final_format,
                output_file=planned_output,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
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


def kgm_to_audio(
    input_file: str,
    target_format: str = "",
    output_file: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
    kgg_key_file: str = "",
    kg_db_file: str = "",
) -> dict:
    """Decode one KGM-family file and optionally transcode to target audio format."""
    temp_input = ""
    try:
        input_file = resolve_input_path(input_file, __file__)
        if not os.path.exists(input_file):
            return {"success": False, "error": f"Input file not found: {input_file}"}

        ext = _ext(input_file)
        if ext not in KGM_PREFIXES:
            return {"success": False, "error": "Input file must be .kgm, .kgma, .vpr, or .kgg"}

        decoded = _decode_kgm_file(
            input_file,
            kgg_key_file=kgg_key_file,
            kg_db_file=kg_db_file,
        )
        audio_bytes = decoded["audio_bytes"]
        source_format = decoded.get("source_format", "")

        ok, final_format, err = _normalize_kgm_target(target_format, source_format)
        if not ok:
            return {"success": False, "error": err}

        if output_file and str(output_file).strip():
            output_file = resolve_output_file(output_file, __file__)
        else:
            output_file = str(Path(input_file).with_suffix(f".{final_format}"))

        output_file = _unique_path(output_file)
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)

        if final_format == source_format:
            Path(output_file).write_bytes(audio_bytes)
        else:
            with tempfile.NamedTemporaryFile(suffix=f".{source_format or 'mp3'}", delete=False) as tmp:
                tmp.write(audio_bytes)
                temp_input = tmp.name

            converted = convert_audio(
                input_file=temp_input,
                target_format=final_format,
                output_file=output_file,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
                preset="custom",
            )
            if not converted.get("success"):
                return converted
            output_file = str(converted.get("output"))

        return {
            "success": True,
            "output": output_file,
            "source_format": source_format,
            "target_format": final_format,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    finally:
        if temp_input:
            try:
                os.remove(temp_input)
            except OSError:
                pass


def kgm_to_audio_batch_stream(
    input_files: list,
    target_format: str = "mp3",
    output_dir: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
    kgg_key_file: str = "",
    kg_db_file: str = "",
) -> dict:
    """Decode KGM/KGMA/KGG files in batch and stream per-file progress events."""
    try:
        if not input_files:
            _emit_stream_event({"type": "error", "error": "No input files provided"})
            return {"success": False, "error": "No input files provided"}

        ok, final_format, err = _normalize_kgm_target(target_format)
        if not ok:
            _emit_stream_event({"type": "error", "error": err})
            return {"success": False, "error": err}

        resolved_paths = [resolve_input_path(str(raw), __file__) for raw in input_files]
        valid_inputs = [p for p in resolved_paths if os.path.exists(p) and _ext(p) in KGM_PREFIXES]

        if output_dir and str(output_dir).strip():
            output_dir = resolve_output_dir(output_dir, __file__)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        elif valid_inputs:
            output_dir = create_unique_child_dir(valid_inputs[0], f"kgm_{final_format}")
        else:
            output_dir = ""

        outputs = []
        errors = []
        total = len(input_files)
        success_count = 0
        fail_count = 0

        _emit_stream_event({
            "type": "start",
            "total": total,
            "success_count": success_count,
            "fail_count": fail_count,
            "output": output_dir,
        })

        for index, input_path in enumerate(resolved_paths, start=1):
            if not os.path.exists(input_path):
                fail_count += 1
                msg = f"Input file not found: {input_path}"
                errors.append({"input": input_path, "error": msg})
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "success": False,
                    "error": msg,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })
                continue

            if _ext(input_path) not in KGM_PREFIXES:
                fail_count += 1
                msg = "Input file must be .kgm, .kgma, .vpr, or .kgg"
                errors.append({"input": input_path, "error": msg})
                _emit_stream_event({
                    "type": "progress",
                    "index": index,
                    "total": total,
                    "input": input_path,
                    "success": False,
                    "error": msg,
                    "success_count": success_count,
                    "fail_count": fail_count,
                })
                continue

            planned_output = _unique_path(_build_default_output(input_path, output_dir, final_format))

            result = kgm_to_audio(
                input_file=input_path,
                target_format=final_format,
                output_file=planned_output,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
                kgg_key_file=kgg_key_file,
                kg_db_file=kg_db_file,
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


def _decode_qmc_v2_file(input_file: str) -> dict:
    """Decode a QMCv2 file (QQ Music: .mflac/.mgg family) via libtakiyasha."""
    ext = _ext(input_file)
    if ext not in QMC_V2_PREFIXES:
        raise ValueError(f"Not a supported QMCv2 format: .{ext}")

    try:
        from libtakiyasha.qmc import QMCv2, probe_qmcv2
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'libtakiyasha'. Install with: pip install libtakiyasha"
        ) from exc

    filething_or_info = probe_qmcv2(input_file)
    _, info = filething_or_info
    if info is None:
        raise ValueError(
            f"QMCv2: no embedded key found in '{Path(input_file).name}'. "
            "This file may require an external key not currently supported."
        )
    crypter = QMCv2.open(filething_or_info)
    audio_bytes = crypter.read()
    return {
        "audio_bytes": audio_bytes,
        "source_format": _infer_audio_format(audio_bytes),
        "metadata": {"key_source": "embedded"},
    }


def _unlock_dispatch(
    input_file: str,
    kgg_key_file: str = "",
    kg_db_file: str = "",
    kwm_core_key: str = "",
    joox_uuid: str = "",
) -> dict:
    """Detect file format and dispatch to the correct decoder. Returns decoded dict."""
    ext = _ext(input_file)
    if ext == NCM_PREFIX:
        return _decode_ncm_file(input_file)
    if ext in NCM_CACHE_PREFIXES:
        return _decode_ncm_cache_file(input_file)
    if ext in KGM_PREFIXES:
        return _decode_kgm_file(input_file, kgg_key_file=kgg_key_file, kg_db_file=kg_db_file)
    if ext in KWM_PREFIXES:
        return _decode_kwm_file(input_file, kwm_core_key=kwm_core_key)
    if ext in QMC_V1_PREFIXES or ext.startswith("bkc"):
        return _decode_qmc_v1_file(input_file)
    if ext in QMC_V2_PREFIXES:
        return _decode_qmc_v2_file(input_file)
    if ext in TM_PREFIXES:
        return _decode_tm_file(input_file)
    if ext in XIAMI_PREFIXES:
        return _decode_xm_file(input_file)
    if ext in XIMALAYA_PREFIXES:
        return _decode_ximalaya_file(input_file)
    if ext in MIGU_PREFIXES:
        return _decode_mg3d_file(input_file)
    if ext in JOOX_PREFIXES:
        return _decode_joox_file(input_file, joox_uuid=joox_uuid)
    allowed = ", ".join(f".{e}" for e in sorted(UNLOCK_ALL_PREFIXES))
    raise ValueError(
        f"Unsupported encrypted format: '.{ext}'. "
        f"Supported: {allowed}"
    )


def _normalize_unlock_target(target_format: str, source_format: str = "") -> tuple[bool, str, str]:
    fmt = (target_format or "").strip().lower()
    if not fmt:
        src = (source_format or "").strip().lower()
        fmt = src if src in {"mp3", "flac"} else "mp3"
    if fmt not in {"mp3", "flac"}:
        return False, "", f"Unsupported target_format: {fmt}. Unlock output only supports mp3 or flac."
    return True, fmt, ""


def unlock_audio(
    input_file: str,
    target_format: str = "",
    output_file: str = "",
    kgg_key_file: str = "",
    kg_db_file: str = "",
    kwm_core_key: str = "",
    joox_uuid: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
) -> dict:
    """Unified unlock: auto-detect encrypted format, decrypt, and optionally transcode.

    Supported inputs include NCM/KGM/KWM/QMC/TM/XM/MG3D families and more.
    """
    temp_input = ""
    try:
        input_file = resolve_input_path(input_file, __file__)
        if not os.path.exists(input_file):
            return {"success": False, "error": f"Input file not found: {input_file}"}

        ext = _ext(input_file)
        if ext not in UNLOCK_ALL_PREFIXES and not ext.startswith("bkc"):
            allowed = ", ".join(f".{e}" for e in sorted(UNLOCK_ALL_PREFIXES))
            return {
                "success": False,
                "error": f"Unsupported encrypted format: '.{ext}'. Supported: {allowed}, .bkc*",
            }

        decoded = _unlock_dispatch(
            input_file,
            kgg_key_file=kgg_key_file,
            kg_db_file=kg_db_file,
            kwm_core_key=kwm_core_key,
            joox_uuid=joox_uuid,
        )
        audio_bytes: bytes = decoded["audio_bytes"]
        source_format: str = decoded.get("source_format", "")
        metadata: dict = decoded.get("metadata") or {}
        cover_data: bytes = decoded.get("cover_data") or b""

        ok, final_format, err = _normalize_unlock_target(target_format, source_format)
        if not ok:
            return {"success": False, "error": err}

        if output_file and str(output_file).strip():
            output_file = resolve_output_file(output_file, __file__)
        else:
            output_file = str(Path(input_file).with_suffix(f".{final_format}"))

        output_file = _unique_path(output_file)
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)

        if final_format == source_format:
            Path(output_file).write_bytes(audio_bytes)
        else:
            with tempfile.NamedTemporaryFile(suffix=f".{source_format or 'mp3'}", delete=False) as tmp:
                tmp.write(audio_bytes)
                temp_input = tmp.name

            converted = convert_audio(
                input_file=temp_input,
                target_format=final_format,
                output_file=output_file,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
                preset="custom",
            )
            if not converted.get("success"):
                return converted
            output_file = str(converted.get("output"))

        # Write metadata tags when available (NCM has rich metadata)
        warnings = []
        if ext == NCM_PREFIX:
            warnings = _apply_ncm_metadata(output_file, final_format, metadata, cover_data)

        payload: dict = {
            "success": True,
            "output": output_file,
            "source_format": source_format,
            "target_format": final_format,
            "input_ext": ext,
        }
        if warnings:
            payload["warnings"] = warnings
        return payload
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    finally:
        if temp_input:
            try:
                os.remove(temp_input)
            except OSError:
                pass


def unlock_audio_batch_stream(
    input_files: list,
    target_format: str = "mp3",
    output_dir: str = "",
    kgg_key_file: str = "",
    kg_db_file: str = "",
    kwm_core_key: str = "",
    joox_uuid: str = "",
    bitrate: str = "192k",
    sample_rate: int = 44100,
    channels: int = 2,
) -> dict:
    """Unified batch unlock for all encrypted formats, streaming per-file progress events."""
    try:
        if not input_files:
            _emit_stream_event({"type": "error", "error": "No input files provided"})
            return {"success": False, "error": "No input files provided"}

        ok, final_format, err = _normalize_unlock_target(target_format)
        if not ok:
            _emit_stream_event({"type": "error", "error": err})
            return {"success": False, "error": err}

        resolved_paths = [resolve_input_path(str(raw), __file__) for raw in input_files]
        valid_inputs = [
            p for p in resolved_paths
            if os.path.exists(p) and (_ext(p) in UNLOCK_ALL_PREFIXES or _ext(p).startswith("bkc"))
        ]

        if output_dir and str(output_dir).strip():
            output_dir = resolve_output_dir(output_dir, __file__)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        elif valid_inputs:
            output_dir = create_unique_child_dir(valid_inputs[0], f"unlock_{final_format}")
        else:
            output_dir = ""

        outputs: list[str] = []
        errors: list[dict] = []
        total = len(input_files)
        success_count = 0
        fail_count = 0

        _emit_stream_event({
            "type": "start",
            "total": total,
            "success_count": success_count,
            "fail_count": fail_count,
            "output": output_dir,
        })

        for index, input_path in enumerate(resolved_paths, start=1):
            if not os.path.exists(input_path):
                fail_count += 1
                msg = f"Input file not found: {input_path}"
                errors.append({"input": input_path, "error": msg})
                _emit_stream_event({
                    "type": "progress", "index": index, "total": total,
                    "input": input_path, "success": False, "error": msg,
                    "success_count": success_count, "fail_count": fail_count,
                })
                continue

            ext = _ext(input_path)
            if ext not in UNLOCK_ALL_PREFIXES and not ext.startswith("bkc"):
                fail_count += 1
                allowed = ", ".join(f".{e}" for e in sorted(UNLOCK_ALL_PREFIXES))
                msg = f"Unsupported format '.{ext}'. Supported: {allowed}"
                errors.append({"input": input_path, "error": msg})
                _emit_stream_event({
                    "type": "progress", "index": index, "total": total,
                    "input": input_path, "success": False, "error": msg,
                    "success_count": success_count, "fail_count": fail_count,
                })
                continue

            planned_output = _unique_path(_build_default_output(input_path, output_dir, final_format))

            result = unlock_audio(
                input_file=input_path,
                target_format=final_format,
                output_file=planned_output,
                kgg_key_file=kgg_key_file,
                kg_db_file=kg_db_file,
                kwm_core_key=kwm_core_key,
                joox_uuid=joox_uuid,
                bitrate=bitrate,
                sample_rate=sample_rate,
                channels=channels,
            )

            if result.get("success"):
                success_count += 1
                out_file = str(result.get("output"))
                outputs.append(out_file)
                _emit_stream_event({
                    "type": "progress", "index": index, "total": total,
                    "input": input_path, "output_file": out_file, "success": True,
                    "success_count": success_count, "fail_count": fail_count,
                })
            else:
                fail_count += 1
                error_msg = str(result.get("error", "Unknown error"))
                errors.append({"input": input_path, "error": error_msg})
                _emit_stream_event({
                    "type": "progress", "index": index, "total": total,
                    "input": input_path, "success": False, "error": error_msg,
                    "success_count": success_count, "fail_count": fail_count,
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


OPERATIONS = {
    "convert_audio": convert_audio,
    "convert_audio_batch": convert_audio_batch,
    "convert_audio_batch_stream": convert_audio_batch_stream,
    "ncm_to_audio": ncm_to_audio,
    "ncm_to_audio_batch_stream": ncm_to_audio_batch_stream,
    "kgm_to_audio": kgm_to_audio,
    "kgm_to_audio_batch_stream": kgm_to_audio_batch_stream,
    "unlock_audio": unlock_audio,
    "unlock_audio_batch_stream": unlock_audio_batch_stream,
    "probe_media": probe_media,
    "supported_audio_formats": supported_audio_formats,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audio Conversion Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))
