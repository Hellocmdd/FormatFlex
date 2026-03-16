"""Image conversion handler for image/image-like inputs."""
import argparse
import io
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from path_utils import (
    create_unique_child_dir,
    resolve_input_path,
    resolve_output_dir,
    resolve_libreoffice_executable,
    resolve_poppler_bin_dir,
)


IMAGE_EXTS = {
    ".png", ".jpg", ".jpeg", ".ico", ".webp", ".avif",
    ".bmp", ".jfif", ".tif", ".tiff", ".tga", ".dds", ".exr",
    ".heic", ".heif", ".psd", ".svg", ".arw", ".cr2", ".nef", ".raf", ".dng", ".dns",
}

OFFICE_EXTS = {
    ".doc", ".docx", ".docm", ".dot", ".dotx", ".dotm",
    ".odt", ".ott", ".odm",
    ".ppt", ".pptx", ".pptm", ".pot", ".potx", ".potm",
    ".odp", ".otp",
    ".xls", ".xlsx", ".xlsm", ".xlt", ".xltx", ".xltm",
    ".ods", ".ots",
}

SUPPORTED_OUTPUT_IMAGE_FORMATS = {"png", "jpg", "jpeg", "webp", "ico", "avif"}
SUPPORTED_ANY_TO_IMAGES_FORMATS = {"png", "jpg", "jpeg", "webp"}


def _normalize_output_format(fmt: str, allow_ico_avif: bool = True) -> str:
    out = (fmt or "png").strip().lower().lstrip(".")
    if out == "jpg":
        out = "jpeg"
    allowed = SUPPORTED_OUTPUT_IMAGE_FORMATS if allow_ico_avif else SUPPORTED_ANY_TO_IMAGES_FORMATS
    if out not in allowed:
        raise ValueError(f"Unsupported output format: {fmt}")
    return out


def _pil_format(fmt: str) -> str:
    mapping = {
        "jpeg": "JPEG",
        "png": "PNG",
        "webp": "WEBP",
        "ico": "ICO",
        "avif": "AVIF",
    }
    return mapping[fmt]


def _build_inputs(input_file: str = "", input_files: list | None = None) -> list[str]:
    files = list(input_files or [])
    if input_file:
        files.append(input_file)
    return files


def _resolve_inputs(raw_inputs: list[str]) -> tuple[list[str], list[dict]]:
    resolved: list[str] = []
    errors: list[dict] = []
    for raw in raw_inputs:
        path = resolve_input_path(raw, __file__)
        if not os.path.exists(path):
            errors.append({"input": raw, "error": f"Input file not found: {path}"})
            continue
        resolved.append(path)
    return resolved, errors


def _resolve_output_dir(raw_output_dir: str, first_input: str) -> str:
    if raw_output_dir and str(raw_output_dir).strip():
        output_dir = resolve_output_dir(raw_output_dir, __file__)
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        return output_dir
    return create_unique_child_dir(first_input, "images")


def _unique_file_path(output_dir: str, base_name: str, ext: str) -> str:
    out = Path(output_dir) / f"{base_name}.{ext}"
    if not out.exists():
        return str(out)
    idx = 2
    while True:
        alt = Path(output_dir) / f"{base_name}_{idx}.{ext}"
        if not alt.exists():
            return str(alt)
        idx += 1


def _register_heif_support_if_available() -> bool:
    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
        return True
    except Exception:
        return False


def _open_with_rawpy(input_path: str):
    import rawpy
    from PIL import Image

    with rawpy.imread(input_path) as raw:
        rgb = raw.postprocess()
    return Image.fromarray(rgb)


def _open_with_svg(input_path: str):
    import cairosvg
    from PIL import Image

    png_bytes = cairosvg.svg2png(url=input_path)
    return Image.open(io.BytesIO(png_bytes))


def _open_with_psd(input_path: str):
    from PIL import Image
    from psd_tools import PSDImage

    psd = PSDImage.open(input_path)
    composed = psd.composite()
    if composed is None:
        raise ValueError("PSD has no composite preview")
    return composed if isinstance(composed, Image.Image) else Image.fromarray(composed)


def _open_with_imageio(input_path: str):
    import imageio.v3 as iio
    import numpy as np
    from PIL import Image

    arr = iio.imread(input_path)
    if not isinstance(arr, np.ndarray):
        raise ValueError("imageio did not return ndarray")
    if arr.ndim == 2:
        return Image.fromarray(arr)
    if arr.ndim == 3:
        return Image.fromarray(arr)
    raise ValueError(f"Unsupported array ndim from imageio: {arr.ndim}")


def _open_image(input_path: str, warnings: list[str]):
    from PIL import Image

    ext = Path(input_path).suffix.lower()
    _register_heif_support_if_available()

    if ext in {".arw", ".cr2", ".nef", ".raf", ".dng", ".dns"}:
        try:
            return _open_with_rawpy(input_path)
        except Exception as exc:
            raise RuntimeError(f"RAW decode failed ({ext}): {exc}") from exc

    if ext == ".svg":
        try:
            return _open_with_svg(input_path)
        except Exception as exc:
            raise RuntimeError(f"SVG decode failed: {exc}") from exc

    if ext == ".psd":
        try:
            return _open_with_psd(input_path)
        except Exception as exc:
            raise RuntimeError(f"PSD decode failed: {exc}") from exc

    try:
        return Image.open(input_path)
    except Exception as pil_exc:
        try:
            img = _open_with_imageio(input_path)
            warnings.append(f"Fallback decoder imageio used for: {input_path}")
            return img
        except Exception as fallback_exc:
            raise RuntimeError(
                f"Unable to decode image: {input_path}. pillow={pil_exc}; imageio={fallback_exc}"
            ) from fallback_exc


def _save_image(img, output_path: str, output_format: str, quality: int):
    from PIL import Image

    pil_fmt = _pil_format(output_format)
    save_kwargs = {}

    if output_format == "jpeg":
        if img.mode in ("RGBA", "LA", "P"):
            rgba = img.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[3])
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
        save_kwargs["quality"] = max(1, min(100, int(quality)))

    if output_format == "webp":
        save_kwargs["quality"] = max(1, min(100, int(quality)))

    if output_format == "ico":
        if img.mode not in ("RGBA", "RGB"):
            img = img.convert("RGBA")

    img.save(output_path, format=pil_fmt, **save_kwargs)


def _render_pdf_to_images(input_path: str, output_dir: str, output_format: str, dpi: int) -> list[str]:
    from pdf2image import convert_from_path

    poppler_bin = resolve_poppler_bin_dir()
    kwargs = {"dpi": max(72, int(dpi))}
    if poppler_bin:
        kwargs["poppler_path"] = poppler_bin
    pages = convert_from_path(input_path, **kwargs)
    stem = Path(input_path).stem
    outputs = []
    for idx, page in enumerate(pages, start=1):
        out = _unique_file_path(output_dir, f"{stem}_page_{idx:03d}", output_format)
        _save_image(page, out, output_format, quality=92)
        outputs.append(out)
    return outputs


def _office_to_temp_pdf(input_path: str) -> str:
    soffice = resolve_libreoffice_executable()
    if not soffice:
        raise RuntimeError("libreoffice/soffice not found")

    tmp_dir = tempfile.mkdtemp(prefix="office_to_pdf_")
    cmd = [
        soffice,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        tmp_dir,
        input_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Unknown libreoffice error").strip()
        raise RuntimeError(f"LibreOffice convert failed: {detail}")

    generated = Path(tmp_dir) / f"{Path(input_path).stem}.pdf"
    if not generated.exists():
        raise RuntimeError(f"Expected PDF not generated: {generated}")
    return str(generated)


def image_convert(
    input_file: str = "",
    input_files: list | None = None,
    output_dir: str = "",
    output_format: str = "png",
    quality: int = 92,
) -> dict:
    """Mutual conversion among common image formats."""
    try:
        fmt = _normalize_output_format(output_format, allow_ico_avif=True)
        raws = _build_inputs(input_file=input_file, input_files=input_files)
        if not raws:
            return {"success": False, "error": "No input files provided"}

        resolved, errors = _resolve_inputs(raws)
        if not resolved:
            return {"success": False, "error": "No valid input files", "errors": errors}

        out_dir = _resolve_output_dir(output_dir, resolved[0])
        warnings: list[str] = []
        outputs: list[str] = []

        for src in resolved:
            ext = Path(src).suffix.lower()
            if ext not in IMAGE_EXTS:
                errors.append({"input": src, "error": f"Unsupported source extension: {ext}"})
                continue

            try:
                img = _open_image(src, warnings)
                base = Path(src).stem
                out = _unique_file_path(out_dir, base, fmt)
                _save_image(img, out, fmt, quality=quality)
                outputs.append(out)
            except Exception as exc:
                errors.append({"input": src, "error": str(exc)})

        return {
            "success": len(outputs) > 0,
            "outputs": outputs,
            "output_dir": out_dir,
            "success_count": len(outputs),
            "fail_count": len(errors),
            "errors": errors,
            "warnings": warnings,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def any_to_images(
    input_file: str = "",
    input_files: list | None = None,
    output_dir: str = "",
    output_format: str = "png",
    quality: int = 92,
    dpi: int = 200,
    first_page_only: bool = False,
) -> dict:
    """Convert supported sources (image/pdf/office/raw/etc.) to images."""
    try:
        fmt = _normalize_output_format(output_format, allow_ico_avif=False)
        raws = _build_inputs(input_file=input_file, input_files=input_files)
        if not raws:
            return {"success": False, "error": "No input files provided"}

        resolved, errors = _resolve_inputs(raws)
        if not resolved:
            return {"success": False, "error": "No valid input files", "errors": errors}

        out_dir = _resolve_output_dir(output_dir, resolved[0])
        warnings: list[str] = []
        outputs: list[str] = []

        for src in resolved:
            ext = Path(src).suffix.lower()
            try:
                if ext in OFFICE_EXTS:
                    tmp_pdf = _office_to_temp_pdf(src)
                    try:
                        pdf_outputs = _render_pdf_to_images(tmp_pdf, out_dir, fmt, dpi=dpi)
                    finally:
                        shutil.rmtree(str(Path(tmp_pdf).parent), ignore_errors=True)
                    if first_page_only and pdf_outputs:
                        outputs.append(pdf_outputs[0])
                    else:
                        outputs.extend(pdf_outputs)
                    warnings.append(f"Office source converted via PDF bridge: {src}")
                    continue

                if ext == ".pdf":
                    pdf_outputs = _render_pdf_to_images(src, out_dir, fmt, dpi=dpi)
                    if first_page_only and pdf_outputs:
                        outputs.append(pdf_outputs[0])
                    else:
                        outputs.extend(pdf_outputs)
                    continue

                if ext in IMAGE_EXTS:
                    img = _open_image(src, warnings)
                    base = Path(src).stem
                    out = _unique_file_path(out_dir, base, fmt)
                    _save_image(img, out, fmt, quality=quality)
                    outputs.append(out)
                    continue

                errors.append({"input": src, "error": f"Unsupported input extension: {ext}"})
            except Exception as exc:
                errors.append({"input": src, "error": str(exc)})

        return {
            "success": len(outputs) > 0,
            "outputs": outputs,
            "output_dir": out_dir,
            "success_count": len(outputs),
            "fail_count": len(errors),
            "errors": errors,
            "warnings": warnings,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def supported_image_formats() -> dict:
    """Return supported formats and optional dependency availability."""
    capabilities = {
        "pillow": True,
        "rawpy": False,
        "pillow_heif": False,
        "cairosvg": False,
        "psd_tools": False,
        "pdf2image": False,
        "imageio": False,
        "libreoffice": bool(resolve_libreoffice_executable()),
    }

    for mod_name in ("rawpy", "pillow_heif", "cairosvg", "psd_tools", "pdf2image", "imageio"):
        try:
            __import__(mod_name)
            capabilities[mod_name] = True
        except Exception:
            capabilities[mod_name] = False

    return {
        "success": True,
        "image_convert_input": sorted(list(IMAGE_EXTS)),
        "image_convert_output": sorted(list(SUPPORTED_OUTPUT_IMAGE_FORMATS)),
        "any_to_images_input": sorted(list(IMAGE_EXTS | OFFICE_EXTS | {".pdf"})),
        "any_to_images_output": sorted(list(SUPPORTED_ANY_TO_IMAGES_FORMATS)),
        "capabilities": capabilities,
    }


OPERATIONS = {
    "image_convert": image_convert,
    "any_to_images": any_to_images,
    "supported_image_formats": supported_image_formats,
}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Image Conversion Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))