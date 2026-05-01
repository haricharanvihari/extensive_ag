import os
import json
import requests
import asyncio
import threading
from datetime import datetime
from bs4 import BeautifulSoup
from pathlib import Path
from fastmcp import FastMCP
from starlette.responses import JSONResponse
from starlette.requests import Request
from starlette.middleware.cors import CORSMiddleware
import uvicorn

from market_gainer_ui import build_gainer_dashboard

# Initialize FastMCP
mcp = FastMCP("MarketGainerServer")

# Data directory
DATA_DIR = Path("E:/Market_ganiers_52week/data")
DATA_DIR.mkdir(exist_ok=True)
NOTES_FILE = DATA_DIR / "master_notes.json"

def load_notes():
    if not NOTES_FILE.exists():
        return []
    try:
        with open(NOTES_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def save_notes(notes):
    with open(NOTES_FILE, "w") as f:
        json.dump(notes, f, indent=2)

def get_latest_data_file() -> Path:
    """Find the most recent gainer data file in the data directory."""
    try:
        # Use a more robust check for Windows paths
        files = [f for f in DATA_DIR.iterdir() if f.name.startswith("private_gainers_") and f.name.endswith(".json")]
        if not files:
            # Check for the old non-dated version as second fallback
            if (DATA_DIR / "private_gainers.json").exists():
                return DATA_DIR / "private_gainers.json"
            return DATA_DIR / "private_gainers.json" # Ultimate fallback path
            
        # Return the one with the highest date in the name
        return max(files, key=lambda p: p.name)
    except Exception as e:
        log_message(f"File discovery error: {str(e)}")
        return DATA_DIR / "private_gainers.json"

def get_dated_filename() -> Path:
    """Generate a filename with the current date."""
    date_str = datetime.now().strftime("%Y%m%d")
    return DATA_DIR / f"private_gainers_{date_str}.json"

# --- TOOLS ---

@mcp.tool()
def fetch_gainers() -> str:
    """Fetch all 150 52-week gainer private companies from Yahoo Finance."""
    url = "https://finance.yahoo.com/markets/private-companies/52-week-gainers/?start=0&count=150"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            return f"Error: Received status code {response.status_code}"
        
        soup = BeautifulSoup(response.text, "html.parser")
        table = soup.find("table")
        if not table:
            return "Error: Could not find data table on the page."
        
        rows = table.find_all("tr")[1:] # Skip header
        data = []
        for row in rows:
            cols = row.find_all("td")
            if len(cols) >= 5:
                symbol = cols[0].text.strip()
                name = cols[1].text.strip()
                price = cols[2].text.strip()
                change = cols[3].text.strip()
                pct_change = cols[4].text.strip()
                year_change = cols[5].text.strip() if len(cols) > 5 else "N/A"
                
                data.append({
                    "symbol": symbol,
                    "name": name,
                    "price": price,
                    "change": change,
                    "pct_change": pct_change,
                    "year_change": year_change
                })
        
        # Save to file with current date
        dated_file = get_dated_filename()
        with open(dated_file, "w") as f:
            json.dump(data, f, indent=2)
            
        return f"Successfully fetched and saved {len(data)} companies to {dated_file.name}."
    except Exception as e:
        return f"Error fetching data: {str(e)}"

@mcp.tool()
def manage_notes(action: str, note_id: str = None, title: str = None, text: str = None) -> str:
    """
    Perform CRUD operations on local analysis notes.
    Actions: 'create', 'read', 'update', 'delete', 'list'
    """
    notes = load_notes()
    
    if action == "create":
        new_note = {
            "id": str(len(notes) + 1),
            "title": title or "Untitled Note",
            "text": text or "",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        notes.append(new_note)
        save_notes(notes)
        return f"Created note with ID: {new_note['id']}"
    
    elif action == "list":
        return json.dumps(notes, indent=2)
    
    elif action == "read":
        for n in notes:
            if n['id'] == note_id:
                return json.dumps(n, indent=2)
        return "Note not found."
    
    elif action == "update":
        for n in notes:
            if n['id'] == note_id:
                if title: n['title'] = title
                if text: n['text'] = text
                n['date'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                save_notes(notes)
                return f"Updated note {note_id}"
        return "Note not found."
    
    elif action == "delete":
        new_notes = [n for n in notes if n['id'] != note_id]
        if len(new_notes) < len(notes):
            save_notes(new_notes)
            return f"Deleted note {note_id}"
        return "Note not found."
    
    return "Invalid action."

@mcp.tool()
def show_intelligence_dashboard():
    """Display the Integrated Market Intelligence Dashboard with market data and analysis notes."""
    market_data = []
    file_path = get_latest_data_file()
    if file_path.exists():
        with open(file_path, "r") as f:
            market_data = json.load(f)
    
    notes = load_notes()
    return build_gainer_dashboard(market_data, notes=notes, dated_filename=file_path.name)

import sys

# --- LOGGING ---
LOG_FILE = Path("E:/Market_ganiers_52week/server_log.txt")

def log_message(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"[{timestamp}] {msg}\n")
    except:
        pass
    # IMPORTANT: Never print to stdout in an MCP server (Stdio mode)
    # Print to stderr so it doesn't break the JSON-RPC protocol
    print(f"[{timestamp}] {msg}", file=sys.stderr)

# --- TOOLS ---

@mcp.tool()
def search_market_news(query: str) -> str:
    """Search for market news or company details on the internet."""
    url = f"https://www.google.com/search?q={query}+market+news"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, "html.parser")
        results = []
        for g in soup.find_all('div', class_='vv779b')[:3]:
            text = g.get_text()
            if text: results.append(text)
        if not results:
            return f"Search for '{query}' performed. Result snippets might be blocked by bot protection, but the query was processed successfully."
        return "\n---\n".join(results)
    except Exception as e:
        return f"Error searching: {str(e)}"

# --- HTTP API FOR EXTENSION & DASHBOARD ---

def run_http_server():
    from starlette.applications import Starlette
    from starlette.routing import Route
    from starlette.responses import HTMLResponse
    import uvicorn
    
    log_message("Initializing Unified Server on port 8000...")
    
    async def get_dashboard_html(request: Request):
        log_message("Serving Dashboard UI...")
        try:
            market_data = []
            file_path = get_latest_data_file()
            log_message(f"Loading data from: {file_path}")
            
            if file_path.exists():
                with open(file_path, "r") as f:
                    market_data = json.load(f)
            
            # Apply filtering if symbol is provided
            filter_symbol = request.query_params.get("symbol")
            if filter_symbol:
                log_message(f"Filtering for symbol: {filter_symbol}")
                market_data = [d for d in market_data if d['symbol'] == filter_symbol]

            app_obj = build_gainer_dashboard(market_data, dated_filename=file_path.name)
            # Call the .html() method to get the string content
            return HTMLResponse(app_obj.html())
        except Exception as e:
            log_message(f"Dashboard Error: {str(e)}")
            return HTMLResponse(f"<h1>Dashboard Error</h1><p>{str(e)}</p>", status_code=500)

    async def save_data(request: Request):
        log_message("Received POST request to /api/save-data")
        try:
            body = await request.body()
            data = json.loads(body)
            log_message(f"Received {len(data)} companies.")
            dated_file = get_dated_filename()
            with open(dated_file, "w") as f:
                json.dump(data, f, indent=2)
            log_message(f"Saved successfully to {dated_file}")
            return JSONResponse({"status": "success", "message": f"Saved to {dated_file.name}"})
        except Exception as e:
            log_message(f"Error saving data: {str(e)}")
            return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

    async def health(request: Request):
        return JSONResponse({"status": "ok"})

    routes = [
        Route("/", get_dashboard_html, methods=["GET"]),
        Route("/api/save-data", save_data, methods=["POST"]),
        Route("/api/health", health, methods=["GET"]),
    ]
    
    app = Starlette(debug=True, routes=routes)
    
    from starlette.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    log_message("Starting Unified Uvicorn on port 8888...")
    try:
        # Use log_level="info" temporarily to see why it's not connecting
        config = uvicorn.Config(app, host="127.0.0.1", port=8888, log_level="info")
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        log_message(f"Uvicorn Error: {str(e)}")

# Start HTTP server in a background thread ONLY IF it's not already running
# and check for a global lock file to prevent cross-process conflicts
LOCK_FILE = DATA_DIR / "server.lock"

def start_unified_server():
    # 1. Thread-level check
    for thread in threading.enumerate():
        if thread.name == "HttpServerThread":
            return
            
    # 2. Process-level check (Lock File)
    if LOCK_FILE.exists():
        try:
            with open(LOCK_FILE, "r") as f:
                old_pid = int(f.read().strip())
                import psutil
                if psutil.pid_exists(old_pid):
                    log_message(f"Server already running on PID {old_pid}")
                    return
        except:
            pass
            
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))

    log_message("Starting background server thread...")
    t = threading.Thread(target=run_http_server, daemon=True, name="HttpServerThread")
    t.start()

if __name__ == "__main__":
    # In direct mode, we start everything
    start_unified_server()
    mcp.run()
