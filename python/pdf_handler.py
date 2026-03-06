"""PDF Handler - Handles all PDF operations."""
import sys
import json
import os
import io
import time
import itertools
import argparse
from pathlib import Path


def merge_pdfs(input_files: list, output_file: str) -> dict:
    """Merge multiple PDFs into one."""
    from pypdf import PdfWriter
    writer = PdfWriter()
    try:
        from pypdf import PdfReader
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
    from pypdf import PdfReader, PdfWriter
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
    from pypdf import PdfReader, PdfWriter
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
    from pypdf import PdfReader, PdfWriter
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
    from pypdf import PdfReader, PdfWriter
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
    from pypdf import PdfReader, PdfWriter
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
            from pypdf import PdfReader as PR
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
    from pypdf import PdfReader, PdfWriter
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
            from pypdf import PdfReader as PR
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
    from pypdf import PdfReader
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


# ── Brute Force ───────────────────────────────────────────────────────────────

CHARSETS = {
    "digits":  "0123456789",
    "lower":   "abcdefghijklmnopqrstuvwxyz",
    "upper":   "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "symbols": "!@#$%^&*()-_=+[]{}|;:,.<>?/",
}

# Module-level reader for each worker process (set by pool initializer)
_bf_reader = None


def _bf_init(shm_name: str, shm_size: int):
    """Pool worker initializer: load PDF once per process via shared memory."""
    global _bf_reader
    from multiprocessing.shared_memory import SharedMemory
    from pypdf import PdfReader
    shm = SharedMemory(name=shm_name)
    data = bytes(shm.buf[:shm_size])
    shm.close()
    _bf_reader = PdfReader(io.BytesIO(data))


def _bf_try_chunk(passwords: list):
    """Try a list of passwords; return the correct one or None."""
    for pwd in passwords:
        try:
            if _bf_reader.decrypt(pwd) != 0:
                return pwd
        except Exception:
            pass
    return None


def _chunk_gen(iterable, size: int):
    """Yield successive chunks of given size from an iterable."""
    it = iter(iterable)
    while True:
        chunk = list(itertools.islice(it, size))
        if not chunk:
            break
        yield chunk


def bruteforce_pdf(pdf_path: str,
                   mode: str = "charset",
                   charset_keys: list = None,
                   custom_charset: str = "",
                   min_len: int = 1,
                   max_len: int = 4,
                   dict_path: str = None,
                   num_workers: int = 0) -> dict:
    """
    Brute-force PDF password using multiprocessing (bypasses GIL for true
    parallelism). Hashlib/OpenSSL underneath uses CPU SIMD intrinsics for MD5.

    Progress is streamed to stdout as JSON lines so Rust can emit Tauri events:
      {"type":"progress","tried":N,"total":T,"speed":S,"eta":E,"elapsed":X}
      {"type":"found","password":"...","tried":N,"elapsed":X}
      {"type":"done","found":false,"tried":N,"elapsed":X}
      {"type":"error","error":"..."}
    """
    import multiprocessing
    import itertools
    from multiprocessing.shared_memory import SharedMemory
    from pypdf import PdfReader

    # ── Validate ──────────────────────────────────────────────────────────────
    if not os.path.exists(pdf_path):
        _bf_print("error", error="File not found")
        return {"success": False, "error": "File not found"}

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    probe = PdfReader(io.BytesIO(pdf_bytes))
    if not probe.is_encrypted:
        _bf_print("error", error="PDF is not encrypted")
        return {"success": False, "error": "PDF is not encrypted"}

    n_workers = num_workers if num_workers > 0 else multiprocessing.cpu_count()
    chunk_size = max(200, 1000 // n_workers)

    # ── Build charset / wordlist ──────────────────────────────────────────────
    if mode == "charset":
        keys = charset_keys or ["digits"]
        raw = "".join(CHARSETS.get(k, k) for k in keys) + (custom_charset or "")
        # deduplicate preserving order
        seen_chars: set = set()
        charset = "".join(c for c in raw if not (c in seen_chars or seen_chars.add(c)))  # type: ignore
        if not charset:
            _bf_print("error", error="Empty charset")
            return {"success": False, "error": "Empty charset"}
        candidates = (
            "".join(p)
            for ln in range(min_len, max_len + 1)
            for p in itertools.product(charset, repeat=ln)
        )
        total = sum(len(charset) ** ln for ln in range(min_len, max_len + 1))
    else:
        if not dict_path or not os.path.exists(dict_path):
            _bf_print("error", error="Dictionary file not found")
            return {"success": False, "error": "Dictionary file not found"}
        with open(dict_path, "r", encoding="utf-8", errors="replace") as f:
            words = [line.rstrip("\n") for line in f]
        candidates = iter(words)
        total = len(words)

    # ── Shared memory for PDF bytes ───────────────────────────────────────────
    shm = SharedMemory(create=True, size=max(1, len(pdf_bytes)))
    shm.buf[:len(pdf_bytes)] = pdf_bytes
    shm_name, shm_size = shm.name, len(pdf_bytes)

    tried = 0
    found_pwd = None
    start_time = time.time()
    last_report = 0.0

    try:
        with multiprocessing.Pool(
            processes=n_workers,
            initializer=_bf_init,
            initargs=(shm_name, shm_size),
        ) as pool:
            for result in pool.imap_unordered(
                _bf_try_chunk,
                _chunk_gen(candidates, chunk_size),
                chunksize=1,
            ):
                tried += chunk_size
                now = time.time()
                elapsed = now - start_time
                speed = int(tried / elapsed) if elapsed > 0 else 0
                eta = int((total - tried) / speed) if speed > 0 and tried < total else -1

                if now - last_report >= 0.4:
                    _bf_print("progress", tried=min(tried, total), total=total,
                              speed=speed, eta=eta, elapsed=round(elapsed, 1))
                    last_report = now

                if result is not None:
                    found_pwd = result
                    pool.terminate()
                    break
    finally:
        shm.close()
        try:
            shm.unlink()
        except Exception:
            pass

    elapsed = time.time() - start_time
    if found_pwd is not None:
        _bf_print("found", password=found_pwd, tried=min(tried, total),
                  elapsed=round(elapsed, 1))
        return {"success": True, "found": True, "password": found_pwd,
                "tried": tried, "elapsed": round(elapsed, 1)}
    else:
        _bf_print("done", found=False, tried=min(tried, total),
                  elapsed=round(elapsed, 1))
        return {"success": True, "found": False, "tried": tried,
                "elapsed": round(elapsed, 1)}


def _bf_print(event_type: str, **kwargs):
    """Print a JSON progress line to stdout (Rust reads this)."""
    print(json.dumps({"type": event_type, **kwargs}, ensure_ascii=False), flush=True)


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
    "bruteforce": bruteforce_pdf,
}

if __name__ == "__main__":
    # Allow bruteforce to be called with streaming output (no final JSON print)
    parser = argparse.ArgumentParser(description="PDF Handler")
    parser.add_argument("operation", choices=list(OPERATIONS.keys()))
    parser.add_argument("params", nargs="?", help="JSON-encoded parameters")
    args = parser.parse_args()

    params = json.loads(args.params) if args.params else {}
    if args.operation == "bruteforce":
        # bruteforce streams progress to stdout itself; just call it
        OPERATIONS[args.operation](**params)
    else:
        result = OPERATIONS[args.operation](**params)
        print(json.dumps(result, ensure_ascii=False))

