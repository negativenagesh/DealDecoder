import os
import requests
import json
import base64
import fitz  # PyMuPDF
from typing import List, Dict, Any, Tuple
from .engine import DiscountRule, CartItem

NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
STEPFUN_MODEL = "stepfun-ai/step-3.7-flash"

def get_nvidia_headers():
    api_key = os.getenv("NVIDIA_NIM_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_NIM_API_KEY not found in environment.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json"
    }

def get_gemini_url():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment.")
    return f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

def clean_json_response(content: Any) -> str:
    if content is None:
        raise ValueError("LLM returned empty content (None).")
    content = str(content).strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()

NL_SYSTEM_PROMPT = """You are an expert Data Engineer and Pricing Rules Engine architect for Opptra's marketplace.
Your task is to parse a natural language rule into a strict JSON object.

The output must be ONLY valid JSON matching this schema:
{
    "success": boolean, // true if parsed, false if completely unintelligible
    "message": string, // if success is false, explain what is missing
    "rule": { // only if success is true
        "ruleId": string, // generate a random ID like "RULE-XX"
        "scope": string, // MUST be one of: "brand", "platform", "cart"
        "appliesTo": string, // The brand or platform name. Null if scope is "cart"
        "type": string, // MUST be one of: "percentage", "flat"
        "value": number, // The percentage amount (e.g. 20, up to 100) or flat rupee amount (e.g. 100)
        "stackable": boolean, // true if it says stackable, otherwise false
        "min_cart_value": number, // Only if scope is "cart", the threshold in rupees. Null otherwise.
        "reasoning": string // A short explanation of the rule
    }
}

Rules for parsing:
1. Be highly lenient and infer intent. 100% off is a valid discount value, do not question it.
2. If the user provides a large number like ">3000" without context, assume they mean "cart value > 3000". Set scope to "cart", appliesTo to null, and min_cart_value to 3000.
3. Example 1: "20% off for Natura Casa brand, stackable with other offers"
   -> scope="brand", appliesTo="Natura Casa", type="percentage", value=20, stackable=true, reasoning="20% off on Natura Casa"
4. Example 2: "Rs.100 flat discount on all Flipkart items"
   -> scope="platform", appliesTo="Flipkart", type="flat", value=100, stackable=false, reasoning="Rs.100 flat off on Flipkart"
5. Example 3: "100% off for >3000"
   -> scope="cart", appliesTo=null, type="percentage", value=100, stackable=false, min_cart_value=3000, reasoning="100% off on cart total > Rs. 3000"

Respond strictly with JSON and nothing else.
"""

def parse_nl_rule_stream(text: str):
    """Generator function that yields SSE for stepfun streaming"""
    messages = [
        {"role": "system", "content": NL_SYSTEM_PROMPT},
        {"role": "user", "content": f"Parse this rule: {text}"}
    ]
    payload = {
        "model": STEPFUN_MODEL,
        "messages": messages,
        "max_tokens": 40000,
        "temperature": 1.0,
        "top_p": 0.95,
        "stream": True
    }
    
    try:
        response = requests.post(NVIDIA_INVOKE_URL, headers=get_nvidia_headers(), json=payload, stream=True)
        response.raise_for_status()
        
        content_acc = ""
        print("\n--- LLM Reasoning Stream ---", flush=True)
        for line in response.iter_lines():
            if line:
                line_decoded = line.decode('utf-8')
                if line_decoded.startswith('data: '):
                    data_str = line_decoded[6:]
                    if data_str.strip() == '[DONE]':
                        break
                    try:
                        chunk = json.loads(data_str)
                        choices = chunk.get('choices', [])
                        if choices:
                            delta = choices[0].get('delta', {})
                            
                            r_chunk = delta.get('reasoning_content', '') or delta.get('reasoning', '')
                            if r_chunk:
                                print(r_chunk, end="", flush=True)
                                yield f"data: {json.dumps({'type': 'reasoning', 'text': r_chunk})}\n\n"
                                
                            c_chunk = delta.get('content', '')
                            if c_chunk:
                                content_acc += c_chunk
                    except json.JSONDecodeError:
                        pass
                        
        print("\n--- End of Reasoning ---", flush=True)
        if not content_acc:
            yield f"data: {json.dumps({'type': 'error', 'message': 'API returned empty content'})}\n\n"
            yield "data: [DONE]\n\n"
            return
            
        cleaned = clean_json_response(content_acc)
        parsed = json.loads(cleaned)
        yield f"data: {json.dumps({'type': 'result', 'data': parsed})}\n\n"
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        yield "data: [DONE]\n\n"


def parse_nl_rule(text: str, model: str = "stepfun") -> Tuple[bool, Any]:
    try:
        if model == "gemini":
            payload = {
                "system_instruction": {"parts": [{"text": NL_SYSTEM_PROMPT}]},
                "contents": [{"parts": [{"text": f"Parse this rule: {text}"}]}],
                "generationConfig": {"temperature": 1.0}
            }
            response = requests.post(get_gemini_url(), headers={"Content-Type": "application/json"}, json=payload)
            response.raise_for_status()
            data = response.json()
            content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
            cleaned = clean_json_response(content)
            parsed = json.loads(cleaned)
            
            if parsed.get("success"):
                return True, parsed.get("rule")
            else:
                return False, parsed.get("message", "Could not parse rule.")
                
        else:
            messages = [
                {"role": "system", "content": NL_SYSTEM_PROMPT},
                {"role": "user", "content": f"Parse this rule: {text}"}
            ]
            payload = {
                "model": STEPFUN_MODEL,
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 1.0,
                "top_p": 0.95,
            }
            response = requests.post(NVIDIA_INVOKE_URL, headers=get_nvidia_headers(), json=payload)
            response.raise_for_status()
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content')
            
            if not content:
                finish_reason = data.get('choices', [{}])[0].get('finish_reason', 'unknown')
                return False, f"API rejected prompt (finish_reason: {finish_reason})."
                
            cleaned = clean_json_response(content)
            parsed = json.loads(cleaned)
            
            if parsed.get("success"):
                return True, parsed.get("rule")
            else:
                return False, parsed.get("message", "Could not parse rule.")
    except Exception as e:
        return False, f"LLM parsing error: {str(e)}"

PDF_SYSTEM_PROMPT = """You are a highly accurate data extraction system.
Extract the tabular cart data from the provided input (image or text).
Return ONLY a JSON array of objects matching this schema:
[
  {
    "itemId": "ITEM-XX", // Generate sequential IDs like ITEM-01
    "product": "Name of product",
    "brand": "Name of brand",
    "platform": "Name of platform",
    "basePrice": number // The price in rupees, as a pure number (e.g. 1299)
  }
]
Do not include markdown blocks, just the JSON array.
"""

def extract_cart_from_pdf(pdf_bytes: bytes, model: str = "stepfun") -> List[Dict[str, Any]]:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            raise ValueError("Empty PDF")
            
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        image_bytes = pix.tobytes("png")
        image_b64 = base64.b64encode(image_bytes).decode()
        
        if model == "gemini":
            payload = {
                "system_instruction": {"parts": [{"text": PDF_SYSTEM_PROMPT}]},
                "contents": [
                    {
                        "parts": [
                            {"text": "Extract the table into JSON."},
                            {"inline_data": {"mime_type": "image/png", "data": image_b64}}
                        ]
                    }
                ],
            }
            response = requests.post(get_gemini_url(), headers={"Content-Type": "application/json"}, json=payload)
            response.raise_for_status()
            data = response.json()
            content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
        else:
            data_url = f"data:image/png;base64,{image_b64}"
            messages = [
                {"role": "system", "content": PDF_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the table into JSON."},
                        {"type": "image_url", "image_url": {"url": data_url}}
                    ]
                }
            ]
            payload = {
                "model": STEPFUN_MODEL,
                "messages": messages,
                "max_tokens": 16384,
                "temperature": 1.0,
                "top_p": 0.95,
            }
            response = requests.post(NVIDIA_INVOKE_URL, headers=get_nvidia_headers(), json=payload)
            response.raise_for_status()
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content')
            
        cleaned = clean_json_response(content)
        return json.loads(cleaned)
        
    except Exception as e:
        print(f"Vision extraction failed: {e}. Falling back to text extraction.")
        return fallback_extract_cart_text(pdf_bytes, model)

def fallback_extract_cart_text(pdf_bytes: bytes, model: str = "stepfun") -> List[Dict[str, Any]]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
        
    if model == "gemini":
        payload = {
            "system_instruction": {"parts": [{"text": PDF_SYSTEM_PROMPT}]},
            "contents": [{"parts": [{"text": f"Raw text:\n{text}"}]}],
        }
        response = requests.post(get_gemini_url(), headers={"Content-Type": "application/json"}, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
    else:
        messages = [
            {"role": "system", "content": PDF_SYSTEM_PROMPT},
            {"role": "user", "content": f"Raw text:\n{text}"}
        ]
        payload = {
            "model": STEPFUN_MODEL,
            "messages": messages,
            "max_tokens": 16384,
            "temperature": 1.0,
            "top_p": 0.95,
        }
        response = requests.post(NVIDIA_INVOKE_URL, headers=get_nvidia_headers(), json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get('choices', [{}])[0].get('message', {}).get('content')
        
    cleaned = clean_json_response(content)
    return json.loads(cleaned)
