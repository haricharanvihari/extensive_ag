const API_VERSION = "v1beta";
const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_API_KEY = "GEMINI_API_KEY";

const SYSTEM_PROMPT = `You are a Metal Price Agent.
IMPORTANT: YOU MUST RESPOND ONLY WITH A SINGLE VALID JSON OBJECT. NO MARKDOWN, NO PREAMBLE, NO TEXT AFTER THE JSON.

Calculate gold/silver cost in INR with GST.
Tools:
1. get_metal_price(symbol): Return price in USD/oz. Symbols: "GC=F" (Gold), "SI=F" (Silver).
2. get_usd_to_inr(): Return exchange rate.
3. calculate_gst_breakdown(gold_grams, silver_grams, gold_usd_oz, silver_usd_oz, exchange_rate, making_charge_pct): Final calculation.

Rules:
- Respond ONLY with JSON.
- Tool call format: {"tool_name": "...", "tool_arguments": {...}}
- Final answer format: {"answer": "..."}`;

const TOOLS = {
    get_metal_price: async (args) => {
        try {
            const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${args.symbol}?interval=1d&range=5d`);
            const data = await resp.json();
            const closeArr = data.chart.result[0].indicators.quote[0].close;
            // Get the last non-null price in the array
            const validPrices = closeArr.filter(p => p != null);
            const price = validPrices[validPrices.length - 1];
            return JSON.stringify({ symbol: args.symbol, price_usd_per_oz: price });
        } catch (e) { return JSON.stringify({ error: "Fetch error" }); }
    },
    get_usd_to_inr: async () => {
        try {
            const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1d&range=5d`);
            const data = await resp.json();
            const closeArr = data.chart.result[0].indicators.quote[0].close;
            const validRates = closeArr.filter(r => r != null);
            const rate = validRates[validRates.length - 1];
            return JSON.stringify({ pair: "USD/INR", rate });
        } catch (e) { return JSON.stringify({ error: "Fetch error" }); }
    },
    calculate_gst_breakdown: (args) => {
        const { gold_grams, silver_grams, gold_usd_oz, silver_usd_oz, exchange_rate, making_charge_pct } = args;
        const GRAMS_PER_OZ = 31.1035;
        const gold_val = (gold_grams * (gold_usd_oz / GRAMS_PER_OZ)) * exchange_rate;
        const silver_val = (silver_grams * (silver_usd_oz / GRAMS_PER_OZ)) * exchange_rate;
        const metal_total = gold_val + silver_val;
        const making = metal_total * (making_charge_pct / 100);
        const gst_metal = metal_total * 0.03;
        const gst_making = making * 0.05;
        const total = metal_total + making + gst_metal + gst_making;
        return JSON.stringify({
            gold_inr: gold_val.toFixed(2), silver_inr: silver_val.toFixed(2),
            total_metal: metal_total.toFixed(2), making_charges: making.toFixed(2),
            total_gst: (gst_metal + gst_making).toFixed(2), final_total: total.toFixed(2)
        });
    }
};

function addLog(text, type = 'thought') {
    const log = document.getElementById('reasoning-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = text;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

async function callGenAI(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${DEFAULT_MODEL}:generateContent?key=${apiKey || DEFAULT_API_KEY}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
}

async function runAgent() {
    const apiKey = document.getElementById('api-key').value || DEFAULT_API_KEY;
    const goldEnabled = document.getElementById('gold-enable').checked;
    const silverEnabled = document.getElementById('silver-enable').checked;
    const goldWeight = goldEnabled ? parseFloat(document.getElementById('gold-weight').value) : 0;
    const silverWeight = silverEnabled ? parseFloat(document.getElementById('silver-weight').value) : 0;
    const mCharge = parseFloat(document.getElementById('making-charge').value);

    if (!goldEnabled && !silverEnabled) {
        addLog("Error: Select a metal."); return;
    }

    document.getElementById('reasoning-log').innerHTML = '';
    document.getElementById('result-area').classList.add('hidden');
    addLog("Agent Started...");

    let messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Calculate for ${goldWeight}g gold, ${silverWeight}g silver, ${mCharge}% making.` }
    ];

    for (let i = 0; i < 6; i++) {
        const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
        addLog(`Iteration ${i+1}: Thinking...`);
        try {
            const resp = await callGenAI(prompt, apiKey);
            let parsed;
            try {
                // Find all objects between { and }
                const regex = /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
                const matches = resp.match(regex);
                if (!matches) throw new Error("No JSON found");
                
                // Find the match that looks like a tool call or answer
                parsed = matches.map(m => {
                    try { return JSON.parse(m); } catch (e) { return null; }
                }).find(obj => obj && (obj.tool_name || obj.answer));

                if (!parsed) throw new Error("No valid tool/answer found in JSON");
            } catch (e) {
                addLog("Error: LLM returned invalid JSON. Retrying...");
                continue;
            }

            if (parsed.answer) {
                addLog("Completed.", "result");
                document.getElementById('result-area').classList.remove('hidden');
                document.getElementById('final-answer').textContent = parsed.answer;
                return;
            }

            if (parsed.tool_name) {
                addLog(`Calling Tool: ${parsed.tool_name}`, "tool");
                const result = await (TOOLS[parsed.tool_name] ? TOOLS[parsed.tool_name](parsed.tool_arguments) : "Tool not found");
                addLog(`Result obtained: ${result}`, "result");
                messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
                messages.push({ role: 'tool', content: result });
            }
        } catch (e) { addLog("Error: " + e.message); break; }
    }
}

// Attach Events
document.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('conn-status');
    if (status) {
        status.textContent = "SYSTEM: Connected. Ready.";
        status.style.color = "#00ff00";
    }

    const calcBtn = document.getElementById('calculate-btn');
    if (calcBtn) calcBtn.onclick = runAgent;

    const goldCheck = document.getElementById('gold-enable');
    const silverCheck = document.getElementById('silver-enable');
    if (goldCheck) goldCheck.onchange = (e) => document.getElementById('gold-weight').disabled = !e.target.checked;
    if (silverCheck) silverCheck.onchange = (e) => document.getElementById('silver-weight').disabled = !e.target.checked;
    
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) settingsToggle.onclick = () => {
        const p = document.getElementById('settings-panel');
        p.style.display = p.style.display === 'block' ? 'none' : 'block';
    };

    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) saveBtn.onclick = () => {
        const key = document.getElementById('api-key').value;
        const store = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
        store.local.set({ apiKey: key }, () => {
            document.getElementById('settings-panel').style.display = 'none';
            addLog("Key Saved.");
        });
    };

    const store = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
    store.local.get(['apiKey'], (res) => {
        if (res.apiKey) document.getElementById('api-key').value = res.apiKey;
    });
});
