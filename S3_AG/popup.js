const API_VERSION = "v1beta";
console.log("popup.js executing...");
const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_API_KEY = "GEMINI_API_KEY";

function getApiUrl(model) {
    return `https://generativelanguage.googleapis.com/${API_VERSION}/models/${model}:generateContent`;
}

const SYSTEM_PROMPT = `You are a Metal Price Agent. 
Calculate gold/silver cost in INR with GST.
Tools:
1. get_metal_price(symbol): Return price in USD/oz. Symbols: "GC=F" (Gold), "SI=F" (Silver).
2. get_usd_to_inr(): Return exchange rate.
3. calculate_gst_breakdown(gold_grams, silver_grams, gold_usd_oz, silver_usd_oz, exchange_rate, making_charge_pct): Final calculation.

Rules:
- Fetch prices and exchange rate first.
- Then calculate.
- Respond ONLY with JSON.
- Tool call: {"tool_name": "...", "tool_arguments": {...}}
- Final answer: {"answer": "..."}`;

const TOOLS = {
    get_metal_price: async (args) => {
        const symbol = args.symbol;
        try {
            // Yahoo Finance Chart API is often easier to fetch
            const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
            const data = await resp.json();
            const price = data.chart.result[0].indicators.quote[0].close[0];
            return JSON.stringify({ symbol, price_usd_per_oz: price });
        } catch (e) {
            return JSON.stringify({ error: "Failed to fetch metal price" });
        }
    },
    get_usd_to_inr: async () => {
        try {
            const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1d&range=1d`);
            const data = await resp.json();
            const rate = data.chart.result[0].indicators.quote[0].close[0];
            return JSON.stringify({ pair: "USD/INR", rate });
        } catch (e) {
            return JSON.stringify({ error: "Failed to fetch exchange rate" });
        }
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
            gold_inr: gold_val.toFixed(2),
            silver_inr: silver_val.toFixed(2),
            total_metal: metal_total.toFixed(2),
            making_charges: making.toFixed(2),
            total_gst: (gst_metal + gst_making).toFixed(2),
            final_total: total.toFixed(2)
        });
    }
};

let messages = [];
const DEFAULT_API_KEY = "GEMINI_API_KEY";

function addLog(text, type = 'thought') {
    const log = document.getElementById('reasoning-log');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = text;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

async function callGenAI(prompt, apiKey) {
    const keyToUse = apiKey || DEFAULT_API_KEY;
    const url = getApiUrl(DEFAULT_MODEL);
    
    const response = await fetch(`${url}?key=${keyToUse}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });
    const data = await response.json();
    
    if (data.error) {
        throw new Error(`API Error: ${data.error.message}`);
    }
    
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No candidates returned from API. Check safety settings or prompt.");
    }
    
    return data.candidates[0].content.parts[0].text;
}

async function runAgent() {
    const savedKey = document.getElementById('api-key').value;
    const apiKey = savedKey || DEFAULT_API_KEY;
    
    if (!apiKey) {
        addLog("Error: API Key is required. Go to settings.", "thought");
        return;
    }

    const goldEnabled = document.getElementById('gold-enable').checked;
    const silverEnabled = document.getElementById('silver-enable').checked;
    
    const gold = goldEnabled ? parseFloat(document.getElementById('gold-weight').value) : 0;
    const silver = silverEnabled ? parseFloat(document.getElementById('silver-weight').value) : 0;
    const mCharge = parseFloat(document.getElementById('making-charge').value);

    if (!goldEnabled && !silverEnabled) {
        addLog("Error: Please select at least one metal.", "thought");
        return;
    }

    document.getElementById('reasoning-log').innerHTML = '';
    document.getElementById('result-area').classList.add('hidden');
    addLog("Starting agent loop...");

    const query = `Calculate cost for ${gold}g gold and ${silver}g silver with ${mCharge}% making charges.`;
    messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query }
    ];

    for (let i = 0; i < 6; i++) {
        let prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
        addLog(`Iteration ${i+1}: Thinking...`);
        
        try {
            const responseText = await callGenAI(prompt, apiKey);
            let parsed;
            try {
                // Try to find JSON in response
                const jsonMatch = responseText.match(/\{.*\}/s);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            } catch (e) {
                addLog("Error parsing LLM response. Retrying...");
                continue;
            }

            if (parsed.answer) {
                addLog(`Final Answer received.`, "result");
                document.getElementById('result-area').classList.remove('hidden');
                document.getElementById('final-answer').textContent = parsed.answer;
                return;
            }

            if (parsed.tool_name) {
                const toolName = parsed.tool_name;
                const toolArgs = parsed.tool_arguments || {};
                addLog(`Tool Call: ${toolName}`, "tool");
                
                const result = await (TOOLS[toolName] ? TOOLS[toolName](toolArgs) : Promise.resolve("Error: Tool not found"));
                addLog(`Tool Result: ${result.substring(0, 50)}...`, "result");
                
                messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
                messages.push({ role: 'tool', content: result });
            }
        } catch (err) {
            addLog(`Error: ${err.message}`, "thought");
            console.error(err);
            break;
        }
    }
}

// Initialization
try {
    const logArea = document.getElementById('reasoning-log');
    if (logArea) logArea.innerHTML = '<div class="log-entry log-thought">Initializing UI components...</div>';

    // UI Interactions
    const goldEnable = document.getElementById('gold-enable');
    const silverEnable = document.getElementById('silver-enable');
    const goldWeight = document.getElementById('gold-weight');
    const silverWeight = document.getElementById('silver-weight');
    const calcBtn = document.getElementById('calculate-btn');
    const settingsToggle = document.getElementById('settings-toggle');
    const saveBtn = document.getElementById('save-settings');
    const apiKeyInput = document.getElementById('api-key');

    if (calcBtn) {
        calcBtn.addEventListener('click', () => {
            console.log("Button click detected");
            runAgent().catch(err => {
                addLog("Execution Error: " + err.message, "thought");
            });
        });
    }

    if (goldEnable && goldWeight) {
        goldEnable.onchange = (e) => { goldWeight.disabled = !e.target.checked; };
    }
    if (silverEnable && silverWeight) {
        silverEnable.onchange = (e) => { silverWeight.disabled = !e.target.checked; };
    }
    if (settingsToggle) {
        settingsToggle.onclick = () => {
            const panel = document.getElementById('settings-panel');
            if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        };
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            const key = apiKeyInput ? apiKeyInput.value : '';
            const data = { apiKey: key };
            try {
                if (typeof browser !== 'undefined' && browser.storage) {
                    browser.storage.local.set(data);
                    addLog("API Key saved.");
                } else if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.set(data, () => addLog("API Key saved."));
                }
            } catch (e) { addLog("Storage save error"); }
        };
    }

    // Load saved key - wrapped in try to prevent crash
    try {
        const loadKey = (result) => {
            if (result && result.apiKey && apiKeyInput) {
                apiKeyInput.value = result.apiKey;
            }
        };
        if (typeof browser !== 'undefined' && browser.storage) {
            browser.storage.local.get(['apiKey']).then(loadKey);
        } else if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['apiKey'], loadKey);
        }
    } catch (e) { console.warn("Storage load skipped"); }

    addLog("Agent system ready.", "thought");

} catch (globalErr) {
    console.error("Critical Init Error", globalErr);
    const log = document.getElementById('reasoning-log');
    if (log) log.innerHTML = `<div style="color:red">Critical Init Error: ${globalErr.message}</div>`;
}
