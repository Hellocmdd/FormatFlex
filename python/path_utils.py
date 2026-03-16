"""Shared path resolution utilities for Python handlers."""
import glob
import os
import re
import shutil
from pathlib import Path


def _repo_root_from_file(caller_file: str) -> Path:
    return Path(caller_file).resolve().parent.parent


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def dep_root() -> Path:
    return repo_root() / "dep"


def resolve_input_path(path_str: str, caller_file: str) -> str:
    """Resolve input path across common working directories."""
    raw = os.path.expandvars(os.path.expanduser(path_str))

    # Handle Windows absolute path in WSL/Linux runtime, e.g. C:\Users\a\file.pdf
    win_abs = re.match(r"^([A-Za-z]):[\\/](.*)$", raw)
    if win_abs:
        drive = win_abs.group(1).lower()
        tail = win_abs.group(2).replace("\\", "/")
        wsl_path = Path(f"/mnt/{drive}/{tail}")
        if wsl_path.exists():
            return str(wsl_path.resolve())

    # Browser file inputs sometimes expose fake paths like C:\fakepath\foo.pdf.
    if re.match(r"^[A-Za-z]:[\\/]fakepath[\\/]", raw, re.IGNORECASE):
        raw = os.path.basename(raw)

    p = Path(raw)
    if p.is_absolute():
        return str(p)

    script_dir = Path(caller_file).resolve().parent
    repo_root = _repo_root_from_file(caller_file)
    candidates = [
        Path.cwd() / p,
        Path.cwd().parent / p,
        repo_root / p,
        script_dir / p,
    ]

    for cand in candidates:
        if cand.exists():
            return str(cand.resolve())

    # Return the original unresolved path string so callers can show a meaningful error.
    return str(p)


def resolve_output_file(path_str: str, caller_file: str) -> str:
    """Resolve output file path; relative paths are anchored at repo root."""
    p = Path(os.path.expandvars(os.path.expanduser(path_str)))
    if p.is_absolute():
        return str(p)

    repo_root = _repo_root_from_file(caller_file)
    return str((repo_root / p).resolve())


def resolve_output_dir(path_str: str, caller_file: str) -> str:
    """Resolve output directory path; relative paths are anchored at repo root."""
    return resolve_output_file(path_str, caller_file)


def default_single_output(input_file: str, suffix: str, ext: str) -> str:
    """Build default output file path next to input file."""
    src = Path(input_file).resolve()
    return str(src.with_name(f"{src.stem}{suffix}{ext}"))


def default_first_input_output(input_files: list, suffix: str, ext: str, caller_file: str) -> str:
    """Build default output path next to first input."""
    first = Path(resolve_input_path(input_files[0], caller_file)).resolve()
    return str(first.with_name(f"{first.stem}{suffix}{ext}"))


def create_unique_child_dir(input_file: str, suffix: str) -> str:
    """Create a unique folder beside input file: <stem>_<suffix>[_N]."""
    src = Path(input_file).resolve()
    parent = src.parent
    base_name = f"{src.stem}_{suffix}"

    candidate = parent / base_name
    if not candidate.exists():
        candidate.mkdir(parents=True, exist_ok=False)
        return str(candidate)

    idx = 2
    while True:
        candidate = parent / f"{base_name}_{idx}"
        if not candidate.exists():
            candidate.mkdir(parents=True, exist_ok=False)
            return str(candidate)
        idx += 1


def _glob_first(pattern: str) -> str | None:
    matches = sorted(glob.glob(pattern))
    for match in matches:
        if Path(match).is_file():
            return str(Path(match).resolve())
    return None


def resolve_executable(
    names: tuple[str, ...],
    local_relative_patterns: tuple[str, ...] = (),
    windows_candidates: tuple[str, ...] = (),
) -> str | None:
    """Resolve an executable from dep-local paths first, then PATH, then Windows common install locations."""
    local_base = dep_root()

    for pattern in local_relative_patterns:
        expanded = os.path.expandvars(pattern)
        full_pattern = str((local_base / expanded).resolve())
        if "*" in full_pattern:
            match = _glob_first(full_pattern)
            if match:
                return match
            continue

        candidate = Path(full_pattern)
        if candidate.is_file():
            return str(candidate)

    for name in names:
        found = shutil.which(name)
        if found:
            return found

    if os.name != "nt":
        return None

    for pattern in windows_candidates:
        expanded = os.path.expandvars(pattern)
        if "*" in expanded:
            match = _glob_first(expanded)
            if match:
                return match
            continue

        candidate = Path(expanded)
        if candidate.is_file():
            return str(candidate.resolve())

    return None


def resolve_ffmpeg_executables() -> tuple[str | None, str | None]:
    ffmpeg_bin = resolve_executable(
        ("ffmpeg",),
        (
            "bin/ffmpeg.exe",
            "tools/ffmpeg/bin/ffmpeg.exe",
            "tools/ffmpeg/**/ffmpeg.exe",
        ),
        (
            r"%ProgramFiles%\ffmpeg\bin\ffmpeg.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\ffmpeg.exe",
        ),
    )
    ffprobe_bin = resolve_executable(
        ("ffprobe",),
        (
            "bin/ffprobe.exe",
            "tools/ffmpeg/bin/ffprobe.exe",
            "tools/ffmpeg/**/ffprobe.exe",
        ),
        (
            r"%ProgramFiles%\ffmpeg\bin\ffprobe.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\ffprobe.exe",
        ),
    )
    return ffmpeg_bin, ffprobe_bin


def resolve_tesseract_executable() -> str | None:
    return resolve_executable(
        ("tesseract",),
        (
            "bin/tesseract.exe",
            "tools/tesseract/tesseract.exe",
            "tools/tesseract/bin/tesseract.exe",
            "tools/tesseract/**/tesseract.exe",
        ),
        (
            r"%ProgramFiles%\Tesseract-OCR\tesseract.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\UB-Mannheim.TesseractOCR_*\tesseract.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\tesseract-ocr.tesseract_*\tesseract.exe",
        ),
    )


def resolve_libreoffice_executable() -> str | None:
    """Resolve LibreOffice/soffice across PATH and common Windows install paths."""
    return resolve_executable(
        ("soffice", "libreoffice"),
        (
            "tools/libreoffice/program/soffice.exe",
            "tools/libreoffice/**/program/soffice.exe",
        ),
        (
            r"%ProgramFiles%\LibreOffice\program\soffice.exe",
            r"%ProgramFiles(x86)%\LibreOffice\program\soffice.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\TheDocumentFoundation.LibreOffice_*\LibreOffice\program\soffice.exe",
        ),
    )


def resolve_pandoc_executable() -> str | None:
    return resolve_executable(
        ("pandoc",),
        (
            "bin/pandoc.exe",
            "tools/pandoc/pandoc.exe",
            "tools/pandoc/**/pandoc.exe",
        ),
        (
            r"%ProgramFiles%\Pandoc\pandoc.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\JohnMacFarlane.Pandoc_*\pandoc.exe",
        ),
    )


def resolve_pdftoppm_executable() -> str | None:
    return resolve_executable(
        ("pdftoppm",),
        (
            "bin/pdftoppm.exe",
            "tools/poppler/Library/bin/pdftoppm.exe",
            "tools/poppler/**/Library/bin/pdftoppm.exe",
        ),
        (
            r"%ProgramFiles%\poppler\Library\bin\pdftoppm.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\oschwartz10612.Poppler_*\Library\bin\pdftoppm.exe",
        ),
    )


def resolve_poppler_bin_dir() -> str | None:
    pdftoppm = resolve_pdftoppm_executable()
    if not pdftoppm:
        return None
    return str(Path(pdftoppm).resolve().parent)


def resolve_wkhtmltopdf_executable() -> str | None:
    return resolve_executable(
        ("wkhtmltopdf",),
        (
            "bin/wkhtmltopdf.exe",
            "tools/wkhtmltopdf/bin/wkhtmltopdf.exe",
            "tools/wkhtmltopdf/**/wkhtmltopdf.exe",
        ),
        (
            r"%ProgramFiles%\wkhtmltopdf\bin\wkhtmltopdf.exe",
            r"%ProgramFiles(x86)%\wkhtmltopdf\bin\wkhtmltopdf.exe",
            r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\wkhtmltopdf.wkhtmltox_*\wkhtmltopdf\bin\wkhtmltopdf.exe",
        ),
    )


def resolve_tex_executable(name: str) -> str | None:
    exe_name = name if name.lower().endswith(".exe") else f"{name}.exe"
    return resolve_executable(
        (name,),
        (
            f"bin/{exe_name}",
            f"tools/miktex/bin/x64/{exe_name}",
            f"tools/miktex/**/{exe_name}",
        ),
        (
            rf"%ProgramFiles%\MiKTeX\miktex\bin\x64\{exe_name}",
            rf"%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64\{exe_name}",
        ),
    )


def resolve_chromium_executable() -> str | None:
    return resolve_executable(
        ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"),
        (
            "tools/chromium/chrome.exe",
            "tools/chromium/**/chrome.exe",
            "tools/chrome/chrome.exe",
            "tools/chrome/**/chrome.exe",
        ),
    )
