"""Shared path resolution utilities for Python handlers."""
import os
import re
from pathlib import Path


def _repo_root_from_file(caller_file: str) -> Path:
    return Path(caller_file).resolve().parent.parent


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
