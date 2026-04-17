import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';

export async function summarizeTabs(tabs) {
    const tabInfo = tabs.map(t => t.title).join(', ');
    const prompt = `I have a list of open browser tabs: ${tabInfo}. Give this session a very short, catchy 2-3 word name that summarizes its topic. Return ONLY the name.`;

    try {
        // Use v1 instead of v1beta for stability
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        
        // Defensive check for candidates
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text.trim();
        } else if (data.error) {
            console.error("Gemini API returned error:", data.error);
        }
        
        return "Session List";
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Session List";
    }
}
