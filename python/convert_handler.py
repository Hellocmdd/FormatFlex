"""Document Conversion Handler - handles format conversions."""
import sys
import json
import os
import argparse
from pathlib import Path


def word_to_pdf(input_file: str, output_file: str) -> dict:
    """Convert Word (.docx) to PDF using LibreOffice."""
    import subprocess
    try:
        out_dir = str(Path(output_file).parent)
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf",
             "--outdir", out_dir, input_file],
            capture_output=True, text=True, timeout=60
        )
        # LibreOffice names the output based on input filename
        expected = os.path.join(out_dir, Path(input_file).stem + ".pdf")
        if os.path.exists(expected) and expected != output_file:
            os.rename(expected, output_file)
        if os.path.exists(output_file):
            return {"success": True, "output": output_file}
        return {"success": False, "error": result.stderr or "Conversion failed"}
    except FileNotFoundError:
        return {"success": False, "error": "LibreOffice not found. Install with: sudo apt install libreoffice"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def excel_to_pdf(input_file: str, output_file: str) -> dict:
    """Convert Excel to PDF via LibreOffice."""
    return word_to_pdf(input_file, output_file)


def pptx_to_pdf(input_file: str, output_file: str) -> dict:
    """Convert PowerPoint to PDF via LibreOffice."""
    return word_to_pdf(input_file, output_file)


def pdf_to_markdown(input_file: str, output_file: str) -> dict:
    """Convert PDF to Markdown by extracting text."""
    from PyPDF2 import PdfReader
    try:
        reader = PdfReader(input_file)
        lines = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                lines.append(f"## Page {i + 1}\n\n{text.strip()}\n")
        content = "\n---\n\n".join(lines)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def images_to_pdf(input_files: list, output_file: str) -> dict:
    """Convert one or more images to a PDF."""
    from PIL import Image
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    try:
        c = canvas.Canvas(output_file, pagesize=A4)
        a4_w, a4_h = A4
        for img_path in input_files:
            img = Image.open(img_path)
            img_w, img_h = img.size
            # Scale to fit A4 while preserving aspect ratio
            scale = min(a4_w / img_w, a4_h / img_h)
            draw_w = img_w * scale
            draw_h = img_h * scale
            x = (a4_w - draw_w) / 2
            y = (a4_h - draw_h) / 2
            c.drawImage(img_path, x, y, width=draw_w, height=draw_h)
            c.showPage()
        c.save()
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def html_to_pdf(input_file: str, output_file: str) -> dict:
    """Convert HTML file to PDF using weasyprint or wkhtmltopdf."""
    # Try weasyprint first
    try:
        import weasyprint
        weasyprint.HTML(filename=input_file).write_pdf(output_file)
        return {"success": True, "output": output_file}
    except ImportError:
        pass
    # Fallback: wkhtmltopdf via subprocess
    import subprocess
    try:
        result = subprocess.run(
            ["wkhtmltopdf", input_file, output_file],
            capture_output=True, text=True, timeout=60
        )
        if os.path.exists(output_file):
            return {"success": True, "output": output_file}
        return {"success": False, "error": result.stderr or "Conversion failed"}
    except FileNotFoundError:
        return {
            "success": False,
            "error": "No HTML-to-PDF converter found. Install weasyprint or wkhtmltopdf."
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def docx_to_txt(input_file: str, output_file: str) -> dict:
    """Extract text from Word document."""
    from docx import Document
    try:
        doc = Document(input_file)
        text = "\n".join([p.text for p in doc.paragraphs])
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(text)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def excel_to_csv(input_file: str, output_dir: str) -> dict:
    """Convert Excel sheets to CSV files."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(input_file, data_only=True)
        os.makedirs(output_dir, exist_ok=True)
        outputs = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            safe_name = "".join(c if c.isalnum() else "_" for c in sheet_name)
            out_path = os.path.join(output_dir, f"{safe_name}.csv")
            import csv
            with open(out_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                for row in ws.iter_rows(values_only=True):
                    writer.writerow([str(v) if v is not None else "" for v in row])
            outputs.append(out_path)
        return {"success": True, "outputs": outputs}
    except Exception as e:
        return {"success": False, "error": str(e)}


OPERATIONS = {
    "word_to_pdf": word_to_pdf,
    "excel_to_pdf": excel_to_pdf,
    "pptx_to_pdf": pptx_to_pdf,
    "pdf_to_markdown": pdf_to_markdown,
    "images_to_pdf": images_to_pdf,
    "html_to_pdf": html_to_pdf,
    "docx_to_txt": docx_to_txt,
    "excel_to_csv": excel_to_csv,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Document Conversion Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))
