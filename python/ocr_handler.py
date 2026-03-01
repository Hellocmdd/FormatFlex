"""OCR Handler - local Tesseract and cloud OCR (Baidu)."""
import sys
import json
import os
import argparse
from pathlib import Path


def ocr_local(image_path: str, lang: str = "chi_sim+eng") -> dict:
    """Extract text from image using local Tesseract OCR."""
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img, lang=lang)
        return {"success": True, "text": text.strip(), "source": "local"}
    except Exception as e:
        return {"success": False, "error": str(e), "source": "local"}


def ocr_baidu(image_path: str, app_id: str, api_key: str, secret_key: str,
              accurate: bool = False) -> dict:
    """Extract text using Baidu OCR cloud API."""
    try:
        from aip import AipOcr
        client = AipOcr(app_id, api_key, secret_key)
        with open(image_path, "rb") as f:
            image_data = f.read()
        if accurate:
            result = client.accurate(image_data)
        else:
            result = client.basicGeneral(image_data)
        if "error_code" in result:
            return {
                "success": False,
                "error": f"Baidu OCR error {result['error_code']}: {result.get('error_msg', '')}",
                "source": "baidu"
            }
        words = [w["words"] for w in result.get("words_result", [])]
        return {
            "success": True,
            "text": "\n".join(words),
            "words_count": result.get("words_result_num", 0),
            "source": "baidu"
        }
    except Exception as e:
        return {"success": False, "error": str(e), "source": "baidu"}


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

            if provider == "baidu" and credentials:
                r = ocr_baidu(tmp_path, **credentials)
            else:
                r = ocr_local(tmp_path, lang=lang)

            results.append({"page": i + 1, "text": r.get("text", ""), "success": r.get("success", False)})
            os.remove(tmp_path)

        combined = "\n\n---\n\n".join(
            [f"[Page {r['page']}]\n{r['text']}" for r in results]
        )
        return {"success": True, "text": combined, "pages": len(pages)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ocr_batch(image_paths: list, lang: str = "chi_sim+eng",
              provider: str = "local", credentials: dict = None) -> dict:
    """Run OCR on multiple images."""
    results = []
    for path in image_paths:
        if provider == "baidu" and credentials:
            r = ocr_baidu(path, **credentials)
        else:
            r = ocr_local(path, lang=lang)
        results.append({"file": path, **r})
    return {"success": True, "results": results}


OPERATIONS = {
    "local": ocr_local,
    "baidu": ocr_baidu,
    "pdf": ocr_pdf,
    "batch": ocr_batch,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCR Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))
