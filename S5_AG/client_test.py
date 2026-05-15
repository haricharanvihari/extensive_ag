import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def run_test_client():
    # 1. Define how to start your Nutrition Server
    server_params = StdioServerParameters(
        command="uv",
        args=["run", "e:/Daily Calorie Planner/mcp_server.py"],
    )

    print("🚀 Connecting to Nutrition Server...")

    try:
        # 2. Establish the connection
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                # 3. Initialize the server
                await session.initialize()
                
                # 4. List available tools to prove it worked
                tools = await session.list_tools()
                print(f"📦 Available Tools: {[t.name for t in tools.tools]}")

                # 5. Call the Precision Nutrition Agent
                print("\n🧠 Sending calculation request to Agent...")
                result = await session.call_tool("calculate_nutrition", arguments={
                    "inputs": {
                        "weight": 85,
                        "height": 185,
                        "age": 32,
                        "gender": "male",
                        "activity": "very active",
                        "goal": "lose"
                    }
                })
                
                print("\n--- AGENT RESPONSE ---")
                print(result.content[0].text)

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_test_client())
