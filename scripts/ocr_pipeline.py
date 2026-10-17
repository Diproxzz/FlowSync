#!/usr/bin/env python3
"""
Multi-Tier Local OCR Fallback Pipeline for InVoiceR
Tiers:
  Tier 3: GLM-OCR (0.9B) via Ollama (Ultra-fast, lowest VRAM overhead)
  Tier 4: PaddleOCR-VL (0.9B) (Tabular & layout structural extraction)
  Tier 5: Qwen2-VL-2B in 4-bit Quantization (High-accuracy vision-language model)
"""

import sys
import os
import time
import json
import base64
import argparse

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")

def run_primary_glm_ocr(image_path, prompt=None):
    """Tier 3: Ultra-fast GLM-OCR (0.9B) via Ollama (Lowest VRAM overhead)"""
    sys.stderr.write("🚀 [Tier 3] Attempting GLM-OCR (0.9B) via Ollama...\n")
    try:
        import requests
        with open(image_path, "rb") as image_file:
            img_base64 = base64.b64encode(image_file.read()).decode("utf-8")

        prompt_text = prompt or "Extract all text, tables, and structural content from this Indian GST sales invoice document exactly as it appears."

        payload = {
            "model": "glm-ocr",
            "prompt": prompt_text,
            "images": [img_base64],
            "stream": False
        }

        start_time = time.time()
        response = requests.post(OLLAMA_URL, json=payload, timeout=90)

        if response.status_code == 200:
            elapsed = time.time() - start_time
            sys.stderr.write(f"✅ Success with GLM-OCR! (Time: {elapsed:.2f}s)\n")
            return {
                "text": response.json().get("response", ""),
                "model": "glm-ocr-0.9b",
                "tier": "tier3_glm_ocr",
                "latency_sec": elapsed
            }
        else:
            raise Exception(f"Ollama server returned HTTP {response.status_code}: {response.text[:200]}")

    except Exception as e:
        sys.stderr.write(f"⚠️ Tier 3 (GLM-OCR) Failed: {str(e)}\n")
        return None

def run_secondary_paddle_vl(image_path):
    """Tier 4: Light PaddleOCR-VL (0.9B) (Fallback for tabular/structural extraction)"""
    sys.stderr.write("🔄 [Tier 4] Falling back to PaddleOCR-VL Pipeline...\n")
    try:
        from paddleocr import PaddleOCR
        start_time = time.time()
        
        # Initialize PaddleOCR (uses CPU if GPU is unavailable)
        ocr = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=False)
        result = ocr.ocr(image_path, cls=True)

        extracted_text = []
        if result:
            for idx in range(len(result)):
                res = result[idx]
                if res:
                    for line in res:
                        if line and len(line) > 1 and line[1]:
                            extracted_text.append(line[1][0])

        elapsed = time.time() - start_time
        sys.stderr.write(f"✅ Success with PaddleOCR! (Time: {elapsed:.2f}s)\n")
        return {
            "text": "\n".join(extracted_text),
            "model": "paddleocr-vl-0.9b",
            "tier": "tier4_paddleocr_vl",
            "latency_sec": elapsed
        }

    except Exception as e:
        sys.stderr.write(f"⚠️ Tier 4 (PaddleOCR-VL) Failed: {str(e)}\n")
        return None

def run_final_qwen_vl(image_path, prompt=None):
    """Tier 5: Heavy Qwen2-VL-2B in 4-bit Quantization (Maximum Accuracy Fallback)"""
    sys.stderr.write("🛡️ [Tier 5] Critical Fallback: Loading Qwen2-VL-2B (Quantized INT4)...\n")
    try:
        # First check if Ollama has qwen2-vl available (super fast execution)
        try:
            import requests
            with open(image_path, "rb") as image_file:
                img_base64 = base64.b64encode(image_file.read()).decode("utf-8")
            prompt_text = prompt or "Transcribe this Indian GST sales invoice document perfectly into clean markdown format, preserving all numbers, HSN, rates, and tables."
            payload = {
                "model": "qwen2-vl:2b",
                "prompt": prompt_text,
                "images": [img_base64],
                "stream": False
            }
            start_time = time.time()
            resp = requests.post(OLLAMA_URL, json=payload, timeout=40)
            if resp.status_code == 200 and resp.json().get("response"):
                elapsed = time.time() - start_time
                sys.stderr.write(f"✅ Success with Qwen2-VL via Ollama! (Time: {elapsed:.2f}s)\n")
                return {
                    "text": resp.json().get("response"),
                    "model": "qwen2-vl-2b-int4",
                    "tier": "tier5_qwen2_vl",
                    "latency_sec": elapsed
                }
        except Exception:
            pass

        # Native HuggingFace Transformers fallback
        import torch
        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
        from PIL import Image

        has_cuda = torch.cuda.is_available()
        if has_cuda:
            torch.cuda.empty_cache()

        start_time = time.time()
        model_id = "Qwen/Qwen2-VL-2B-Instruct"

        load_kwargs = {
            "torch_dtype": "auto",
        }
        if has_cuda:
            load_kwargs["device_map"] = "auto"
            load_kwargs["load_in_4bit"] = True
        else:
            load_kwargs["device_map"] = "cpu"
            load_kwargs["low_cpu_mem_usage"] = True

        model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_id,
            **load_kwargs
        )
        processor = AutoProcessor.from_pretrained(model_id)

        image = Image.open(image_path)
        prompt_text = prompt or "Transcribe this Indian GST sales invoice document perfectly into clean markdown format with tables."
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt_text}
                ]
            }
        ]

        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = processor(text=[text], images=image, videos=None, padding=True, return_tensors="pt")
        if torch.cuda.is_available():
            inputs = inputs.to("cuda")

        generated_ids = model.generate(**inputs, max_new_tokens=1024)
        generated_ids_trimmed = [out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)]
        output_text = processor.batch_decode(generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)

        elapsed = time.time() - start_time
        sys.stderr.write(f"✅ Success with Qwen2-VL Transformers! (Time: {elapsed:.2f}s)\n")
        return {
            "text": output_text[0],
            "model": "qwen2-vl-2b-int4",
            "tier": "tier5_qwen2_vl",
            "latency_sec": elapsed
        }

    except Exception as e:
        sys.stderr.write(f"❌ Tier 5 (Qwen2-VL-2B) Failed: {str(e)}\n")
        return None

def orchestrate_ocr_pipeline(image_path, requested_tier="all", prompt=None):
    """Executes single tier or runs structured cascade"""
    if requested_tier == "glm":
        return run_primary_glm_ocr(image_path, prompt)
    elif requested_tier == "paddle":
        return run_secondary_paddle_vl(image_path)
    elif requested_tier == "qwen_vl":
        return run_final_qwen_vl(image_path, prompt)

    # Cascade all local tiers
    res = run_primary_glm_ocr(image_path, prompt)
    if res: return res

    res = run_secondary_paddle_vl(image_path)
    if res: return res

    res = run_final_qwen_vl(image_path, prompt)
    if res: return res

    return None

def main():
    parser = argparse.ArgumentParser(description="Multi-tier Local OCR Engine")
    parser.add_argument("--image", required=True, help="Path to image file")
    parser.add_argument("--tier", default="all", choices=["all", "glm", "paddle", "qwen_vl"], help="OCR Tier to execute")
    parser.add_argument("--prompt", default=None, help="Optional custom prompt")
    args = parser.parse_args()

    if not os.path.exists(args.image):
        print(json.dumps({"success": False, "error": f"Image file not found: {args.image}"}))
        sys.exit(1)

    result = orchestrate_ocr_pipeline(args.image, requested_tier=args.tier, prompt=args.prompt)
    if result:
        print(json.dumps({"success": True, **result}))
    else:
        print(json.dumps({
            "success": False,
            "error": f"Document parsing failed for tier '{args.tier}'. Check model availability."
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
