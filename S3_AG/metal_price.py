"""
Metal Price Agentic AI - Assignment Submission
This script implements an agent that calculates the final cost of gold and silver with GST.
Follows the pattern of 10_full_agent.py.
"""
import warnings
import logging
import os

# Suppress warnings and logging for a cleaner console output
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", message=".*non-text parts.*")
os.environ['GRPC_VERBOSITY'] = 'ERROR' # Reduce GRPC logs
logging.getLogger('google').setLevel(logging.ERROR)
import json
import re
import time
import math
import yfinance as yf
from google import genai
from dotenv import load_dotenv

# ============================================================
# Configuration
# ============================================================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite-preview")
THROTTLE_SECONDS = 2  # Reduced for faster demo, but still safe

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set. Create a .env file with GEMINI_API_KEY=...")

client = genai.Client(api_key=GEMINI_API_KEY)

def call_llm(prompt: str) -> str:
    """Send a prompt to Gemini and return the text response.
    Explicitly extracts text parts to avoid 'thought_signature' warnings.
    """
    time.sleep(THROTTLE_SECONDS)
    response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
    
    # Manually collect only text parts to avoid the library's automatic warning on .text
    text_parts = []
    if response.candidates:
        for part in response.candidates[0].content.parts:
            if part.text:
                text_parts.append(part.text)
    
    return "".join(text_parts)

# ============================================================
# Tools
# ============================================================

def get_metal_price(symbol: str) -> str:
    """
    Fetch the latest price for a metal ticker from Yahoo Finance.
    Gold: GC=F, Silver: SI=F
    Returns price in USD per troy ounce.
    """
    try:
        ticker = yf.Ticker(symbol)
        data = ticker.history(period="1d")
        if not data.empty:
            price = float(data['Close'].iloc[-1])
            return json.dumps({"symbol": symbol, "price_usd_per_oz": round(price, 2)})
        return json.dumps({"error": f"No data found for {symbol}"})
    except Exception as e:
        return json.dumps({"error": str(e)})

def get_usd_to_inr() -> str:
    """
    Fetch the current USD to INR exchange rate.
    """
    try:
        # Ticker for USD/INR exchange rate
        ticker = yf.Ticker("USDINR=X")
        data = ticker.history(period="1d")
        if not data.empty:
            rate = float(data['Close'].iloc[-1])
            return json.dumps({"pair": "USD/INR", "rate": round(rate, 4)})
        return json.dumps({"error": "No data found for USDINR=X"})
    except Exception as e:
        return json.dumps({"error": str(e)})

def calculate_gst_breakdown(gold_grams: float, silver_grams: float, gold_usd_oz: float, silver_usd_oz: float, exchange_rate: float, making_charge_pct: float = 10.0) -> str:
    """
    Calculate the total cost including GST and making charges.
    GST Rules:
    - 3% GST on metal total value in INR.
    - 5% GST on making charges.
    1 troy ounce = 31.1035 grams.
    """
    try:
        # Constants
        GRAMS_PER_OZ = 31.1035
        
        # Metal costs in INR
        gold_val_inr = (gold_grams * (gold_usd_oz / GRAMS_PER_OZ)) * exchange_rate
        silver_val_inr = (silver_grams * (silver_usd_oz / GRAMS_PER_OZ)) * exchange_rate
        
        total_metal_val = gold_val_inr + silver_val_inr
        
        # Making charges (assume 10% if not specified)
        making_charges = total_metal_val * (making_charge_pct / 100.0)
        
        # GST Calculations
        gst_on_metal = total_metal_val * 0.03
        gst_on_making = making_charges * 0.05
        
        total_gst = gst_on_metal + gst_on_making
        final_total = total_metal_val + making_charges + total_gst
        
        return json.dumps({
            "gold_value_inr": round(gold_val_inr, 2),
            "silver_value_inr": round(silver_val_inr, 2),
            "total_metal_value": round(total_metal_val, 2),
            "making_charges": round(making_charges, 2),
            "gst_on_metal": round(gst_on_metal, 2),
            "gst_on_making": round(gst_on_making, 2),
            "total_gst": round(total_gst, 2),
            "final_total": round(final_total, 2)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

tools = {
    "get_metal_price": get_metal_price,
    "get_usd_to_inr": get_usd_to_inr,
    "calculate_gst_breakdown": calculate_gst_breakdown
}

# ============================================================
# System Prompt
# ============================================================
system_prompt = """You are a Metal Price Agent that calculates the final cost of gold and silver in INR including GST.

You have access to these tools:
1. get_metal_price(symbol: str) -> str
   Returns current price for 'GC=F' (Gold) or 'SI=F' (Silver) in USD/oz.
2. get_usd_to_inr() -> str
   Returns current USD to INR exchange rate.
3. calculate_gst_breakdown(gold_grams: float, silver_grams: float, gold_usd_oz: float, silver_usd_oz: float, exchange_rate: float, making_charge_pct: float) -> str
   Performs the final calculation with GST. making_charge_pct is a percentage value like 10.0 or 12.0.

Required Process:
1. Call get_metal_price for 'GC=F' and 'SI=F' separately.
2. Call get_usd_to_inr for the exchange rate.
3. Call calculate_gst_breakdown with the fetched data.
4. Provide the final answer.

Rules:
- Call only ONE tool at a time.
- Respond with ONLY the JSON object. 

Formats:
Tool Call: {"tool_name": "<name>", "tool_arguments": {"<arg>": <val>}}
Final Answer: {"answer": "<clear summary of costs and GST>"}
"""

# ============================================================
# Agent Loop
# ============================================================

def parse_llm_response(text: str) -> list:
    """Parses one or more JSON objects from the text."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"```(json)?\n?", "", text)
        text = text.split("```")[0].strip()
    
    results = []
    # Simplified regex to find JSON objects
    for match in re.finditer(r'\{.*?\}', text, re.DOTALL):
        try:
            results.append(json.loads(match.group()))
        except:
            continue
    
    if not results:
        try:
            return [json.loads(text)]
        except:
            raise ValueError(f"Could not parse any JSON from: {text}")
    return results

def run_agent(user_query: str, max_iterations: int = 6):
    print(f"\n[USER]: {user_query}")
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_query},
    ]
    
    for i in range(max_iterations):
        print(f"\n--- Reasoning Step {i+1} ---")
        
        prompt = ""
        for m in messages:
            if m["role"] == "system": prompt += m["content"] + "\n\n"
            elif m["role"] == "user": prompt += f"User: {m['content']}\n\n"
            elif m["role"] == "assistant": prompt += f"Assistant: {m['content']}\n\n"
            elif m["role"] == "tool": prompt += f"Tool Result: {m['content']}\n\n"
        
        response_text = call_llm(prompt)
        # Handle Potential Unicode for Windows console
        try:
            print(f"Thought: {response_text.strip()}")
        except UnicodeEncodeError:
            print(f"Thought: {response_text.encode('ascii', 'ignore').decode('ascii').strip()}")
        
        try:
            parsed_list = parse_llm_response(response_text)
        except Exception as e:
            print(f"Error parsing: {e}")
            messages.append({"role": "assistant", "content": response_text})
            messages.append({"role": "user", "content": "Please provide valid JSON."})
            continue

        for parsed in parsed_list:
            if "answer" in parsed:
                try:
                    print(f"\n[FINAL ANSWER]: {parsed['answer']}")
                except UnicodeEncodeError:
                    print(f"\n[FINAL ANSWER]: {parsed['answer'].encode('ascii', 'ignore').decode('ascii')}")
                return parsed["answer"]

            if "tool_name" in parsed:
                name = parsed["tool_name"]
                args = parsed.get("tool_arguments", {})
                print(f"-> Tool Call: {name}({args})")
                
                if name not in tools:
                    result = json.dumps({"error": f"Tool {name} not found"})
                else:
                    result = tools[name](**args)
                print(f"-> Result: {result}")
                
                messages.append({"role": "assistant", "content": json.dumps(parsed)})
                messages.append({"role": "tool", "content": result})

if __name__ == "__main__":
    query = "Calculate the price for 10 grams of gold and 50 grams of silver. Assume 12% making charges."
    run_agent(query)
