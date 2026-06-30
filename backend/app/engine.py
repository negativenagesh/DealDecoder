from pydantic import BaseModel
from typing import List, Optional

class DiscountRule(BaseModel):
    ruleId: str
    scope: str  # 'brand', 'platform', 'cart'
    appliesTo: Optional[str] = None # Optional because 'cart' scope doesn't need it
    type: str # 'percentage', 'flat'
    value: float
    stackable: bool
    min_cart_value: Optional[float] = None
    reasoning: Optional[str] = None

class CartItem(BaseModel):
    itemId: str
    product: str
    brand: str
    platform: str
    basePrice: float

class DiscountResult(BaseModel):
    itemId: str
    product: str
    brand: str
    platform: str
    basePrice: float
    finalPrice: float
    totalDiscount: float
    appliedRules: List[str]
    skippedRules: List[str]
    reasoning: str

class CartOfferResult(BaseModel):
    appliedRules: List[str]
    savings: float
    reasoning: str

class CalculateResponse(BaseModel):
    results: List[DiscountResult]
    cart_offer: Optional[CartOfferResult] = None
    final_cart_total: float

def rule_matches_item(item: CartItem, rule: DiscountRule) -> bool:
    if rule.scope.lower() == 'brand':
        applies = rule.appliesTo.strip().lower() if rule.appliesTo else ""
        return item.brand.strip().lower() == applies
    if rule.scope.lower() == 'platform':
        applies = rule.appliesTo.strip().lower() if rule.appliesTo else ""
        return item.platform.strip().lower() == applies
    return False

def calculate_discount_amount(price: float, rule: DiscountRule) -> float:
    if rule.type.lower() == 'percentage':
        return round(price * rule.value / 100)
    if rule.type.lower() == 'flat':
        return rule.value
    return 0

def rule_to_reasoning(rule: DiscountRule) -> str:
    if rule.reasoning:
        return rule.reasoning
    scope_label = 'Brand' if rule.scope.lower() == 'brand' else 'Platform'
    if rule.type.lower() == 'percentage':
        return f"{scope_label} offer: {rule.value}% off"
    if rule.type.lower() == 'flat':
        return f"{scope_label} offer: Rs.{rule.value} off"
    return f"{scope_label} offer applied"

def apply_discounts(item: CartItem, rules: List[DiscountRule]) -> DiscountResult:
    matching_rules = [r for r in rules if rule_matches_item(item, r)]
    
    if not matching_rules:
        return DiscountResult(
            itemId=item.itemId,
            product=item.product,
            brand=item.brand,
            platform=item.platform,
            basePrice=item.basePrice,
            finalPrice=item.basePrice,
            totalDiscount=0,
            appliedRules=[],
            skippedRules=[],
            reasoning='No offers available'
        )
    
    non_stackable = [r for r in matching_rules if not r.stackable]
    stackable = [r for r in matching_rules if r.stackable]
    
    winner = None
    skipped = []
    
    if non_stackable:
        sorted_non_stackable = sorted(
            non_stackable,
            key=lambda r: calculate_discount_amount(item.basePrice, r),
            reverse=True
        )
        winner = sorted_non_stackable[0]
        skipped = sorted_non_stackable[1:]
        
    price = item.basePrice
    applied_rules = []
    reasoning_parts = []
    
    if winner:
        discount = calculate_discount_amount(price, winner)
        discount = min(discount, price)
        price -= discount
        applied_rules.append(winner.ruleId)
        reasoning_parts.append(rule_to_reasoning(winner))
        
    for rule in stackable:
        discount = calculate_discount_amount(price, rule)
        discount = min(discount, price)
        price -= discount
        applied_rules.append(rule.ruleId)
        reasoning_parts.append(rule_to_reasoning(rule))
        
    final_price = max(0.0, round(price))
    
    return DiscountResult(
        itemId=item.itemId,
        product=item.product,
        brand=item.brand,
        platform=item.platform,
        basePrice=item.basePrice,
        finalPrice=final_price,
        totalDiscount=item.basePrice - final_price,
        appliedRules=applied_rules,
        skippedRules=[r.ruleId for r in skipped],
        reasoning=" + ".join(reasoning_parts)
    )

def process_cart(cart_items: List[CartItem], rules: List[DiscountRule]) -> CalculateResponse:
    # 1. Process item-level discounts
    item_results = [apply_discounts(item, rules) for item in cart_items]
    
    # 2. Process cart-level discounts
    cart_rules = [r for r in rules if r.scope.lower() == 'cart']
    
    current_cart_total = sum(r.finalPrice for r in item_results)
    
    cart_offer_result = None
    
    # If multiple cart rules match, we'll pick the one that gives max discount.
    # The requirement didn't specify multiple cart rules, but we should handle it robustly.
    best_cart_rule = None
    best_cart_savings = 0
    
    for rule in cart_rules:
        # Check condition
        if rule.min_cart_value is None or current_cart_total >= rule.min_cart_value:
            savings = calculate_discount_amount(current_cart_total, rule)
            savings = min(savings, current_cart_total)
            if savings > best_cart_savings:
                best_cart_savings = savings
                best_cart_rule = rule
                
    if best_cart_rule:
        current_cart_total = max(0.0, current_cart_total - best_cart_savings)
        
        reasoning = ""
        if best_cart_rule.reasoning:
            reasoning = f"{best_cart_rule.reasoning} \u2014 Rs.{best_cart_savings} saved"
        elif best_cart_rule.type.lower() == 'percentage':
            reasoning = f"Cart offer: {best_cart_rule.value}% off \u2014 Rs.{best_cart_savings} saved"
        elif best_cart_rule.type.lower() == 'flat':
            reasoning = f"Cart offer: Rs.{best_cart_rule.value} off \u2014 Rs.{best_cart_savings} saved"
            
        cart_offer_result = CartOfferResult(
            appliedRules=[best_cart_rule.ruleId],
            savings=best_cart_savings,
            reasoning=reasoning
        )
        
    return CalculateResponse(
        results=item_results,
        cart_offer=cart_offer_result,
        final_cart_total=current_cart_total
    )
