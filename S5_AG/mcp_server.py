from mcp.server.fastmcp import FastMCP
from daily_calorie_planner import PrecisionNutritionAgent, NutritionInputs

mcp = FastMCP("PrecisionServer")

@mcp.tool()
def calculate_nutrition(inputs: NutritionInputs) -> str:
    """
    Calculates a precise daily nutrition plan with multi-step reasoning and verification.
    """
    agent = PrecisionNutritionAgent()
    result = agent.generate_plan(inputs)
    return result.model_dump_json(indent=2)

@mcp.tool()
def add(a: float, b: float) -> float:
    """Return a + b."""
    return a + b

@mcp.tool()
def subtract(a: float, b: float) -> float:
    """Return a - b."""
    return a - b

if __name__ == "__main__":
    mcp.run(transport="stdio")
