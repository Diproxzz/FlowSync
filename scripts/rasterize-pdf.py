import sys
import json
import base64
import pymupdf

def process_pdf(pdf_path, dpi=150):
    doc = pymupdf.open(pdf_path)
    pages = []
    
    for i in range(min(len(doc), 3)): # max 3 pages per invoice in v1
        page = doc[i]
        text = page.get_text()
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("png")
        b64 = base64.b64encode(img_bytes).decode("ascii")
        pages.append({
            "pageNumber": i + 1,
            "text": text.strip(),
            "hasText": len(text.strip()) > 200,
            "pngBase64": b64,
            "width": pix.width,
            "height": pix.height
        })
        
    return pages

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    dpi = int(sys.argv[2]) if len(sys.argv) > 2 else 150
    try:
        result = process_pdf(pdf_path, dpi)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
