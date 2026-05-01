# Market Gainer AI (Market Intelligence System)

Market Gainer AI is a sophisticated market intelligence system that combines a Firefox extension for real-time data scraping with a Python-based MCP (Model Context Protocol) server. It features an interactive dashboard that visualizes private company 52-week gainers using high-performance charts and agentic reasoning simulations.

## Project Description

Many investors struggle to track fast-moving private market data. Market Gainer AI addresses this by bridging the gap between the browser and a local intelligence hub:

- **Browser Integration:** Scrapes live 52-week gainer data directly from Yahoo Finance.
- **Unified Server:** A dual-purpose Python server that handles both MCP tool requests and a Starlette-powered web dashboard.
- **Intelligence Dashboard:** Visualizes data through a horizontal Bar Chart (Top Performers) and a Scatter Plot (Full Portfolio Distribution).
- **Agentic Simulation:** The system simulates "Reasoning Steps" during startup, providing a premium AI agent experience.

## Key Features

- **One-Click Scraping:** Instantly capture 150+ companies from Yahoo Finance.
- **Real-Time Push:** Seamlessly send captured JSON data from the Firefox popup to the local server.
- **Dual-Chart Visualization:**
  - **🏆 Top 15 Gainers:** Interactive bar chart with guaranteed labels for high-growth leaders.
  - **📈 Portfolio Distribution:** Scatter plot mapping Price vs. Growth for the entire 110-company set.
- **Interactive Filtering:** One-click "Quick Filter" buttons to isolate specific companies across all charts and lists.
- **Agentic Reasoning:** Console-based thought logs showing how the AI discovers tools and initializes data.
- **Robust Lifecycle:** Process-level locking (PID-based) to prevent port conflicts and zombie processes.

## How It Works

1. **Capture:** User clicks "Fetch Latest Gainers" in the Firefox Extension.
2. **Push:** User clicks "Push to UI" to send the JSON payload to `http://127.0.0.1:8888`.
3. **Persist:** The Python server saves the data with a date-stamp (e.g., `private_gainers_20260502.json`).
4. **Visualize:** The Starlette server re-renders the Prefab UI dashboard using the latest discovered file.
5. **Analyze:** User interacts with the dashboard using Quick Filters and tooltips to identify high-momentum targets.

## Installation (Developer / Local)

### 1. Python Server Setup
1. Ensure you have Python 3.10+ installed.
2. Install dependencies:
   ```bash
   pip install starlette uvicorn mcp fastmcp requests beautifulsoup4 psutil
   ```
3. Start the system:
   ```bash
   python market_gainer_client.py
   ```

### 2. Firefox Extension Setup
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` from the root directory.
4. Pin the **Market Gainer AI** icon (Orange) to your toolbar.

## Usage Guide

1. **Launch**: Start the Python client to see the Agentic Reasoning steps and activate the server.                             [python python market_gainer_client.py]
3. **Scrape**: Open Yahoo Finance (Private Gainers page) and click the extension icon.
4. **Sync**: Click **Fetch Latest Gainers**, then click the orange **Push to UI** button.
5. **Explore**: Open `http://127.0.0.1:8888` in your browser.
6. **Filter**: Click any symbol in the **🎯 Quick Filter** row to isolate that company's performance.

## Agentic Reasoning Simulation

The system provides real-time feedback in the terminal to simulate a "thinking" AI agent:
```json
--- Reasoning Step 1 ---
Thought: {"tool_name": "list_tools", "tool_arguments": {}}
-> Tool Call: list_tools()
-> Result: ['fetch_gainers', 'manage_notes', 'show_dashboard']
```

## Data and Privacy

- **Local-First:** All scraped market data is saved to your local `E:\Market_ganiers_52week\data\` directory.
- **No Cloud Required:** Data transmission happens entirely on `127.0.0.1` (localhost).
- **Transparency:** All interactions are logged to `server_log.txt` for auditability.

## Repository Structure

- `market_gainer_client.py`: The entry point for the agentic client.
- `market_gainer_server.py`: The heart of the system (MCP + Starlette + PID Locking).
- `market_gainer_ui.py`: The Prefab UI dashboard definition (Charts + Layout).
- `popup.js` / `popup.html`: The Firefox extension frontend and scraping logic.
- `manifest.json`: Extension metadata and permissions.
- `data/`: Local storage for historical gainer JSON files.
- `server_log.txt`: Real-time system diagnostics.
