"""PDF Handler - Handles all PDF operations."""
import sys
import json
import os
import argparse
from pathlib import Path


def merge_pdfs(input_files: list, output_file: str) -> dict:
    """Merge multiple PDFs into one."""
    from PyPDF2 import PdfWriter
    writer = PdfWriter()
    try:
        from PyPDF2 import PdfReader
        for f in input_files:
            reader = PdfReader(f)
            for page in reader.pages:
                writer.add_page(page)
        with open(output_file, "wb") as out:
            writer.write(out)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def split_pdf(input_file: str, output_dir: str, ranges: list = None) -> dict:
    """Split PDF into individual pages or by ranges."""
    from PyPDF2 import PdfReader, PdfWriter
    try:
        reader = PdfReader(input_file)
        total_pages = len(reader.pages)
        os.makedirs(output_dir, exist_ok=True)
        stem = Path(input_file).stem
        outputs = []

        if ranges:
            for i, (start, end) in enumerate(ranges):
                writer = PdfWriter()
                for p in range(start - 1, min(end, total_pages)):
                    writer.add_page(reader.pages[p])
                out_path = os.path.join(output_dir, f"{stem}_part{i+1}.pdf")
                with open(out_path, "wb") as f:
                    writer.write(f)
                outputs.append(out_path)
        else:
            for i, page in enumerate(reader.pages):
                writer = PdfWriter()
                writer.add_page(page)
                out_path = os.path.join(output_dir, f"{stem}_page{i+1}.pdf")
                with open(out_path, "wb") as f:
                    writer.write(f)
                outputs.append(out_path)

        return {"success": True, "outputs": outputs, "total_pages": total_pages}
    except Exception as e:
        return {"success": False, "error": str(e)}


def encrypt_pdf(input_file: str, output_file: str, password: str) -> dict:
    """Encrypt PDF with password."""
    from PyPDF2 import PdfReader, PdfWriter
    try:
        reader = PdfReader(input_file)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(password)
        with open(output_file, "wb") as f:
            writer.write(f)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def decrypt_pdf(input_file: str, output_file: str, password: str) -> dict:
    """Decrypt password-protected PDF."""
    from PyPDF2 import PdfReader, PdfWriter
    try:
        reader = PdfReader(input_file)
        if reader.is_encrypted:
            reader.decrypt(password)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        with open(output_file, "wb") as f:
            writer.write(f)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def compress_pdf(input_file: str, output_file: str) -> dict:
    """Compress PDF by removing redundant data."""
    from PyPDF2 import PdfReader, PdfWriter
    try:
        reader = PdfReader(input_file)
        writer = PdfWriter()
        for page in reader.pages:
            page.compress_content_streams()
            writer.add_page(page)
        with open(output_file, "wb") as f:
            writer.write(f)
        original_size = os.path.getsize(input_file)
        compressed_size = os.path.getsize(output_file)
        return {
            "success": True,
            "output": output_file,
            "original_size": original_size,
            "compressed_size": compressed_size,
            "ratio": round((1 - compressed_size / original_size) * 100, 1)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_watermark(input_file: str, output_file: str, text: str,
                  font_size: int = 40, opacity: float = 0.3,
                  color: str = "gray") -> dict:
    """Add text watermark to each PDF page."""
    from PyPDF2 import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    import io
    try:
        reader = PdfReader(input_file)
        writer = PdfWriter()
        color_map = {
            "gray": colors.gray,
            "red": colors.red,
            "blue": colors.blue,
            "black": colors.black,
        }
        fill_color = color_map.get(color, colors.gray)

        for page in reader.pages:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            packet = io.BytesIO()
            c = canvas.Canvas(packet, pagesize=(w, h))
            c.saveState()
            c.setFillColor(fill_color, alpha=opacity)
            c.setFont("Helvetica", font_size)
            c.translate(w / 2, h / 2)
            c.rotate(45)
            c.drawCentredString(0, 0, text)
            c.restoreState()
            c.save()
            packet.seek(0)
            from PyPDF2 import PdfReader as PR
            watermark_page = PR(packet).pages[0]
            page.merge_page(watermark_page)
            writer.add_page(page)

        with open(output_file, "wb") as f:
            writer.write(f)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_page_numbers(input_file: str, output_file: str,
                     position: str = "bottom-center",
                     start: int = 1, font_size: int = 12) -> dict:
    """Add page numbers to PDF."""
    from PyPDF2 import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    import io
    try:
        reader = PdfReader(input_file)
        writer = PdfWriter()
        for i, page in enumerate(reader.pages):
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            packet = io.BytesIO()
            c = canvas.Canvas(packet, pagesize=(w, h))
            num_text = str(i + start)
            c.setFont("Helvetica", font_size)

            if position == "bottom-center":
                c.drawCentredString(w / 2, 20, num_text)
            elif position == "bottom-right":
                c.drawRightString(w - 20, 20, num_text)
            elif position == "bottom-left":
                c.drawString(20, 20, num_text)
            elif position == "top-center":
                c.drawCentredString(w / 2, h - 20, num_text)

            c.save()
            packet.seek(0)
            from PyPDF2 import PdfReader as PR
            num_page = PR(packet).pages[0]
            page.merge_page(num_page)
            writer.add_page(page)

        with open(output_file, "wb") as f:
            writer.write(f)
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def pdf_to_docx(input_file: str, output_file: str) -> dict:
    """Convert PDF to Word document."""
    from pdf2docx import Converter
    try:
        cv = Converter(input_file)
        cv.convert(output_file, start=0, end=None)
        cv.close()
        return {"success": True, "output": output_file}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_pdf_info(input_file: str) -> dict:
    """Get PDF metadata and info."""
    from PyPDF2 import PdfReader
    try:
        reader = PdfReader(input_file)
        meta = reader.metadata or {}
        return {
            "success": True,
            "pages": len(reader.pages),
            "encrypted": reader.is_encrypted,
            "title": meta.get("/Title", ""),
            "author": meta.get("/Author", ""),
            "size": os.path.getsize(input_file),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


OPERATIONS = {
    "merge": merge_pdfs,
    "split": split_pdf,
    "encrypt": encrypt_pdf,
    "decrypt": decrypt_pdf,
    "compress": compress_pdf,
    "watermark": add_watermark,
    "page_numbers": add_page_numbers,
    "to_docx": pdf_to_docx,
    "info": get_pdf_info,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PDF Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    result = OPERATIONS[args.operation](**params)
    print(json.dumps(result, ensure_ascii=False))
