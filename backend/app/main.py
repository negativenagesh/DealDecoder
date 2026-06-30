from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
import uvicorn

from .engine import CartItem, DiscountRule, CalculateResponse, process_cart
from .llm import parse_nl_rule, parse_nl_rule_stream, extract_cart_from_pdf

load_dotenv()

app = FastAPI(title="DealDecoder Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CalculateRequest(BaseModel):
    items: List[CartItem]
    rules: List[DiscountRule]

class ParseRuleRequest(BaseModel):
    text: str
    model: str = "stepfun"
    show_thinking: bool = False

class ParseRuleResponse(BaseModel):
    success: bool
    message: str = ""
    rule: DiscountRule = None

@app.post("/api/calculate", response_model=CalculateResponse)
def calculate_discounts(req: CalculateRequest):
    return process_cart(req.items, req.rules)

@app.post("/api/rules/parse")
def parse_rule(req: ParseRuleRequest):
    if req.model == "stepfun" and req.show_thinking:
        headers = {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
        return StreamingResponse(
            parse_nl_rule_stream(req.text), 
            media_type="text/event-stream",
            headers=headers
        )
        
    success, result = parse_nl_rule(req.text, req.model)
    if success:
        return ParseRuleResponse(success=True, rule=result)
    else:
        return ParseRuleResponse(success=False, message=result)

@app.post("/api/cart/upload-pdf", response_model=List[CartItem])
async def upload_pdf(file: UploadFile = File(...), model: str = Form("stepfun")):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Must be a PDF file")
    
    contents = await file.read()
    try:
        items = extract_cart_from_pdf(contents, model)
        # Validate items
        valid_items = [CartItem(**item) for item in items]
        return valid_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
