import os
import sys
import io
import shutil
import pymupdf
from PIL import Image

def compress_pdf(input_path: str, output_path: str, max_kb: float = 20.0) -> bool:
    """
    Compresses a PDF file to below `max_kb` kilobytes (default 20 KB).
    Preserves text and layout readability.
    """
    max_bytes = int(max_kb * 1024) - 200 # Safe margin strictly below limit
    
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")
        
    in_size = os.path.getsize(input_path)
    
    # 1. If already below or equal to max size, no need to compress
    if in_size <= max_bytes:
        if os.path.abspath(input_path) != os.path.abspath(output_path):
            shutil.copyfile(input_path, output_path)
        return True

    # 2. Try lossless PyMuPDF deflate / garbage collection
    try:
        doc = pymupdf.open(input_path)
        lossless_bytes = doc.tobytes(deflate=True, garbage=4, clean=True)
        if len(lossless_bytes) <= max_bytes:
            with open(output_path, "wb") as f:
                f.write(lossless_bytes)
            return True
    except Exception as e:
        doc = None

    if doc is None or len(doc) == 0:
        doc = pymupdf.open(input_path)

    # 3. If still exceeds max_bytes, use adaptive 1-bit monochrome rasterization.
    # Invoices are black/white text with lines; 1-bit PNG + Flate compression produces
    # crisp, perfectly legible text at very small sizes (< 20 KB).
    dpis = [115, 110, 105, 100, 95, 90, 85, 80, 75, 72, 65, 60, 50, 40]
    best_candidate = None
    best_size = float("inf")

    for dpi in dpis:
        try:
            out_doc = pymupdf.open()
            for page in doc:
                pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
                img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
                # Binarize: threshold 190 turns gray/colored background white and keeps text crisp black
                img_bw = img.point(lambda p: 255 if p > 190 else 0, mode="1")
                
                buf = io.BytesIO()
                img_bw.save(buf, format="PNG", optimize=True)
                
                new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
                new_page.insert_image(page.rect, stream=buf.getvalue())

            compressed_bytes = out_doc.tobytes(deflate=True, garbage=4)
            size = len(compressed_bytes)

            if size < best_size:
                best_candidate = compressed_bytes
                best_size = size

            if size <= max_bytes:
                with open(output_path, "wb") as f:
                    f.write(compressed_bytes)
                return True
        except Exception:
            continue

    # 4. Fallback if still slightly over: grayscale JPEG with reduced quality
    if best_candidate is None or best_size > max_bytes:
        for quality in [40, 30, 20, 15]:
            try:
                out_doc = pymupdf.open()
                for page in doc:
                    pix = page.get_pixmap(dpi=72, colorspace=pymupdf.csGRAY)
                    img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=quality, optimize=True)
                    new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
                    new_page.insert_image(page.rect, stream=buf.getvalue())

                compressed_bytes = out_doc.tobytes(deflate=True, garbage=4)
                size = len(compressed_bytes)
                if size < best_size:
                    best_candidate = compressed_bytes
                    best_size = size
                if size <= max_bytes:
                    with open(output_path, "wb") as f:
                        f.write(compressed_bytes)
                    return True
            except Exception:
                continue

    # Write the best candidate found
    if best_candidate is not None:
        with open(output_path, "wb") as f:
            f.write(best_candidate)
        return best_size <= max_bytes

    return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python compress_pdf.py <input_path> <output_path> [max_kb]")
        sys.exit(1)
        
    in_path = sys.argv[1]
    out_path = sys.argv[2]
    max_kb = float(sys.argv[3]) if len(sys.argv) > 3 else 20.0
    
    success = compress_pdf(in_path, out_path, max_kb)
    out_size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    print(f"Compressed {in_path} -> {out_path}: {out_size} bytes ({out_size/1024:.2f} KB), target: {max_kb} KB, success: {success}")
    if not success and out_size > max_kb * 1024:
        sys.exit(2)
