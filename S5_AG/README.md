# Precision Calorie Planner (Firefox Extension)

Precision Calorie Planner is an agentic AI-powered Firefox extension and Python tool that calculates scientifically backed daily nutrition plans. It uses the **Mifflin-St Jeor** equation, applies Physical Activity Level (PAL) multipliers, and performs a multi-step "Reasoning Loop" to ensure mathematical consistency across meal distributions.

## Project Description

Nutrition planning is often prone to calculation errors and "hallucinations" in standard AI responses. This project provides a robust, automated solution using a structured Reasoning Agent to:

- **Calculate BMR**: Uses the gold-standard Mifflin-St Jeor formula based on age, weight, and height.
- **Determine TDEE**: Automatically scales caloric needs based on activity levels.
- **Multi-Step Macro Splitting**: Precisely allocates Protein, Carbs, and Fats using calibrated ratios.
- **Error-Absorbing Meal Distribution**: Splits totals across multiple meals while ensuring the final sum matches the target 100% via an error-absorption algorithm.
- **Transparency**: Displays a full "Reasoning Log" showing the AI's internal step-by-step logic.

## Key Features

- **Agentic Reasoning Loop**: Implements a Think → Calculate → Verify cycle for high-stakes nutrition planning.
- **Pydantic Validation**: Uses industry-standard Pydantic models for strict data integrity and schema enforcement.
- **MCP Server Support**: Includes a Model Context Protocol (MCP) server, allowing the agent to be used as a tool by other LLMs (like Claude or ChatGPT).
- **Modern UI**: Features a sleek, dark-themed "Glassmorphism" design with smooth micro-animations.
- **Interactive CLI**: Includes `daily_calorie_planner.py` for terminal-based use with real-time user inputs.

## How It Works (The Reasoning Loop)

The extension drives a step-by-step reasoning process to eliminate mathematical drift:

1.  **[THINK]**: The Agent identifies the user's goal (e.g., "Lose Weight") and selects the appropriate caloric adjustment (-500 kcal).
2.  **[CALCULATE]**: It computes BMR and TDEE using hard-coded mathematical formulas to prevent LLM arithmetic errors.
3.  **[DISTRIBUTE]**: It splits the target across the requested number of meals, applying complex constraints like "protein increasing toward dinner."
4.  **[VERIFY]**: It performs an internal "Self-Check" by summing the meals and comparing them to the target.
5.  **[RESULT]**: Only if the verification passes does the agent return the final JSON payload.

## 🧠 Reasoning Evaluation (F1 Criteria)

The core prompt is qualified against the **F1 Criteria** for structured reasoning:

| Criterion | Score | Note |
|-----------|-------|------|
| **Explicit Reasoning** | ✅ | Uses `[THINK]`, `[CALCULATE]`, and `[VERIFY]` tags. |
| **Structured Output** | ✅ | Enforces a strict JSON schema with Pydantic. |
| **Tool Separation** | ✅ | Clearly separates math (Mifflin-St Jeor) from logic. |
| **Internal Self-Checks** | ✅ | **Crucial:** Sums meals and verifies against TDEE. |
| **Fallbacks** | ✅ | Specifies behavior for missing data or invalid inputs. |

## Demo
### Demo (Click below thumbnail)
<a href="https://www.youtube.com/watch?v=BmqwBlcMnFM">
  <img src="./icon.png" width="250" alt="Watch the Demo here">
</a>

## Installation (Developer / Local)

### 1. Firefox Extension
1.  Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2.  Click **Load Temporary Add-on**.
3.  Select the **`manifest.json`** file from the `Daily Calorie Planner` root folder.

### 2. Python Backend (MCP Server)
1.  Ensure you have `uv` installed.
2.  Run the server:
    ```powershell
    uv run mcp_server.py
    ```

## Usage Guide

1.  Click the extension icon to open the popup.
2.  Enter your **Age, Weight, and Height**.
3.  Select your **Activity Level** and **Goal** (Lose/Maintain/Gain).
4.  Click **Calculate Plan**.
5.  Watch the **Reasoning Log** as the agent computes your stats and verifies the meal distribution.

## Repository Structure

- `daily_calorie_planner.py`: The core logic and Pydantic models.
- `mcp_server.py`: The unified server exposing nutrition and math tools.
- `client_test.py`: Async client for testing the server connection.
- `popup.html/css/js`: The modern extension frontend.
- `manifest.json`: Extension metadata and permissions.

---
*Created for the "Planning and Reasoning with Language Models" Assignment.*
