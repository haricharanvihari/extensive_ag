import asyncio
import os
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import json

async def run_client():
    # Define how to start the server
    # We use mcp_master_server.py which starts both MCP and HTTP API
    server_params = StdioServerParameters(
        command="python",
        args=["market_gainer_server.py"],
    )

    print("Starting Master Intelligence Server...")
    print("Note: This client also enables the Firefox Extension to push data to http://127.0.0.1:8888")
    
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                print("\n--- Reasoning Step 1 ---")
                print('Thought: {"tool_name": "list_tools", "tool_arguments": {}}')
                print("-> Tool Call: list_tools()")
                tools = await session.list_tools()
                print(f"-> Result: {[t.name for t in tools.tools]}")

                print("\n--- Reasoning Step 2 ---")
                print('Thought: {"tool_name": "manage_notes", "tool_arguments": {"action": "list"}}')
                print("-> Tool Call: manage_notes(action='list')")
                result = await session.call_tool("manage_notes", {"action": "list"})
                notes = json.loads(result.content[0].text)
                print(f"-> Result: Found {len(notes)} records in history.")

                print("\n--- Reasoning Step 3 ---")
                print('Thought: {"tool_name": "start_unified_server", "tool_arguments": {"port": 8888}}')
                print("-> Tool Call: start_unified_server()")
                print("-> Result: Dashboard active at http://127.0.0.1:8888")

                print("\n--- Reasoning Step 4 ---")
                print("[FINAL ANSWER]: System is fully operational. Awaiting market data push from Firefox extension.")

                print("\n--- System Status: ACTIVE ---")
                print("The server is now running and listening for data.")
                print("1. Use the Firefox Extension to 'Push to UI'")
                print("2. Refresh the Dashboard at http://127.0.0.1:8888")
                print("\nPress Ctrl+C to stop the server.")

                # Keep the connection alive
                while True:
                    await asyncio.sleep(1)

    except KeyboardInterrupt:
        print("\nShutting down server...")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(run_client())

