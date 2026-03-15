"""OCR Handler - local Tesseract and cloud OCR (GLM)."""
import sys
import json
import os
import argparse
from path_utils import resolve_input_path


def ocr_local(image_path: str, lang: str = "chi_sim+eng") -> dict:
    """Extract text from image using local Tesseract OCR."""
    try:
        import pytesseract
        from PIL import Image
        image_path = resolve_input_path(image_path, __file__)
        if not os.path.exists(image_path):
            return {"success": False, "error": f"Input file not found: {image_path}. Please select the file using native file picker so absolute path is available.", "source": "local"}
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img, lang=lang)
        return {"success": True, "text": text.strip(), "source": "local"}
    except Exception as e:
        return {"success": False, "error": str(e), "source": "local"}


def ocr_glm(image_path: str, api_key: str) -> dict:
    """Extract text using GLM-OCR (ZhipuAI)."""
    try:
        import base64
        import mimetypes
        from zai import ZhipuAiClient
        image_path = resolve_input_path(image_path, __file__)
        
        if not os.path.exists(image_path):
            return {"success": False, "error": f"Input file not found: {image_path}. Please select the file using native file picker so absolute path is available.", "source": "glm"}

        with open(image_path, "rb") as f:
            base64_image = base64.b64encode(f.read()).decode('utf-8')

        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type:
            mime_type = "application/octet-stream"

        file_data_url = f"data:{mime_type};base64,{base64_image}"

        client = ZhipuAiClient(api_key=api_key)
        response = client.layout_parsing.create(
            model="glm-ocr",
            file=file_data_url,
        )

        # zai-sdk may return either dict-like or object-like response.
        md_text = None
        if isinstance(response, dict):
            md_text = response.get("md_results")
        else:
            md_text = getattr(response, "md_results", None)

        if not md_text:
            return {
                "success": False,
                "error": "GLM-OCR returned empty md_results",
                "source": "glm"
            }
        
        return {
            "success": True,
            "text": md_text,
            "source": "glm"
        }
    except Exception as e:
        return {"success": False, "error": str(e), "source": "glm"}


def ocr_pdf(pdf_path: str, lang: str = "chi_sim+eng",
            provider: str = "local", credentials: dict = None) -> dict:
    """Extract text from each page of a PDF using OCR."""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        return {
            "success": False,
            "error": "pdf2image not installed. Run: pip install pdf2image"
        }
    try:
        pdf_path = resolve_input_path(pdf_path, __file__)
        if not os.path.exists(pdf_path):
            return {"success": False, "error": f"Input file not found: {pdf_path}. Please select the file using native file picker so absolute path is available."}
        pages = convert_from_path(pdf_path, dpi=200)
        results = []
        for i, page_img in enumerate(pages):
            import io
            buf = io.BytesIO()
            page_img.save(buf, format="PNG")
            buf.seek(0)

            # Save temp image
            tmp_path = f"/tmp/ocr_page_{i}.png"
            page_img.save(tmp_path)

            if provider == "glm" and credentials:
                r = ocr_glm(tmp_path, api_key=credentials.get("api_key"))
            else:
                r = ocr_local(tmp_path, lang=lang)

            results.append({"page": i + 1, "text": r.get("text", ""), "success": r.get("success", False)})
            os.remove(tmp_path)

        # Keep page content separation but also return per-page raw text list,
        # so downstream converters can map placeholder page indices reliably.
        page_texts = [r["text"] for r in results]
        combined = "\n\n---\n\n".join(page_texts)
        return {"success": True, "text": combined, "pages": len(pages), "page_texts": page_texts}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ocr_batch(image_paths: list, lang: str = "chi_sim+eng",
              provider: str = "local", credentials: dict = None) -> dict:
    """Run OCR on multiple images."""
    results = []
    for path in image_paths:
        path = resolve_input_path(path, __file__)
        if not os.path.exists(path):
            results.append({"file": path, "success": False, "error": "Input file not found", "source": provider})
            continue
        if provider == "glm" and credentials:
            r = ocr_glm(path, api_key=credentials.get("api_key"))
        else:
            r = ocr_local(path, lang=lang)
        results.append({"file": path, **r})
    return {"success": True, "results": results}


def ocr_auto(input_path: str, provider: str = "local", lang: str = "chi_sim+eng",
             credentials: dict = None) -> dict:
    """Unified OCR entry. Auto-detect PDF vs image by file suffix."""
    credentials = credentials or {}
    input_path = resolve_input_path(input_path, __file__)

    if not os.path.exists(input_path):
        return {
            "success": False,
            "error": f"Input file not found: {input_path}. Please select the file using native file picker so absolute path is available.",
        }

    ext = os.path.splitext(input_path)[1].lower()
    is_pdf = ext == ".pdf"

    if is_pdf:
        if provider == "glm":
            api_key = credentials.get("api_key")
            if not api_key:
                return {"success": False, "error": "Missing GLM API key"}
            return ocr_pdf(
                pdf_path=input_path,
                lang=lang,
                provider="glm",
                credentials={"api_key": api_key}
            )

        return ocr_pdf(pdf_path=input_path, lang=lang, provider="local", credentials={})

    if provider == "glm":
        api_key = credentials.get("api_key")
        if not api_key:
            return {"success": False, "error": "Missing GLM API key", "source": "glm"}
        return ocr_glm(image_path=input_path, api_key=api_key)

    return ocr_local(image_path=input_path, lang=lang)


OPERATIONS = {
    "local": ocr_local,
    "glm": ocr_glm,
    "pdf": ocr_pdf,
    "batch": ocr_batch,
    "auto": ocr_auto,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCR Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))
