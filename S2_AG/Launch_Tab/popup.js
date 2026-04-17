import { summarizeTabs } from './gemini.js';

document.addEventListener('DOMContentLoaded', () => {
    loadSessions();

    document.getElementById('captureBtn').addEventListener('click', captureAllTabs);
    
    // Redirect to Full Manager for complex actions
    document.getElementById('importFolderBtn').addEventListener('click', () => {
        browser.tabs.create({ url: "manager.html" });
    });
    
    document.getElementById('exportBtn').addEventListener('click', exportAllAsBackup);
});

function updateStatus(message, isError = false) {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusText');
    if (!bar || !text) return;
    bar.style.display = 'block';
    text.textContent = message;
    text.style.color = isError ? '#ef4444' : '#10b981';
}

async function captureAllTabs() {
    const captureBtn = document.getElementById('captureBtn');
    captureBtn.disabled = true;
    captureBtn.textContent = "Processing...";

    try {
        const tabs = await browser.tabs.query({});
        const validTabs = tabs.filter(tab => {
            return !tab.url.startsWith('about:') && 
                   !tab.url.startsWith('moz-extension:') &&
                   !tab.url.startsWith('view-source:');
        });

        if (validTabs.length === 0) {
            updateStatus("No capture-able tabs found", true);
            resetBtn();
            return;
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        const storage = await browser.storage.local.get('sessions') || {};
        let allSessions = storage.sessions || {};
        
        // Ensure object format
        if (Array.isArray(allSessions)) {
            const obj = {};
            allSessions.forEach(s => {
                const d = s.date || todayStr;
                if (!obj[d]) obj[d] = { summary: s.summary, tabs: [] };
                obj[d].tabs = mergeAndDeduplicate(obj[d].tabs, s.tabs);
            });
            allSessions = obj;
        }

        const tabData = validTabs.map(tab => ({
            title: tab.title,
            url: tab.url,
            lastAccessed: tab.lastAccessed || Date.now()
        }));

        let existingSession = allSessions[todayStr] || { tabs: [], summary: "" };
        const mergedTabs = mergeAndDeduplicate(existingSession.tabs, tabData);

        updateStatus("Summarizing...");
        let summary = await summarizeTabs(mergedTabs);
        
        // Fallback to "Session List"
        if (!summary || summary === "Untitled Session" || summary === "Work Session" || summary === "Session list") {
            summary = (existingSession.summary && existingSession.summary !== "Untitled Session") ? existingSession.summary : "Session List";
        }

        const newSession = {
            summary: summary,
            tabs: mergedTabs,
            date: todayStr,
            lastUpdated: now.getTime()
        };

        allSessions[todayStr] = newSession;
        await browser.storage.local.set({ sessions: allSessions });

        updateStatus("Backing up JSON...");
        await triggerAutoExport(newSession, todayStr);

        updateStatus("Closing tabs...");
        const tabIds = validTabs.map(t => t.id);
        await browser.tabs.create({}); 
        await browser.tabs.remove(tabIds);

        loadSessions();
    } catch (error) {
        console.error("Capture Error:", error);
        updateStatus(`Error: ${error.message}`, true);
    } finally {
        resetBtn();
    }
}

function mergeAndDeduplicate(existing, incoming) {
    const map = new Map();
    [...existing, ...incoming].forEach(item => {
        if (!map.has(item.url) || item.lastAccessed > map.get(item.url).lastAccessed) {
            map.set(item.url, item);
        }
    });
    return Array.from(map.values()).sort((a,b) => b.lastAccessed - a.lastAccessed);
}

async function triggerAutoExport(sessionData, date) {
    const timestamp = new Date().getTime();
    const filename = `url_session_data/session_${date}_${timestamp}.json`;
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    try {
        await browser.downloads.download({
            url: url,
            filename: filename,
            saveAs: false 
        });
    } catch (e) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_${date}_${timestamp}.json`;
        a.click();
    }
}

async function loadSessions() {
    const list = document.getElementById('sessionsList');
    const storage = await browser.storage.local.get('sessions');
    let allSessions = storage.sessions || {};
    let needsSave = false;
    
    // Migration helper: Convert array to object AND Rename "Untitled Session"
    if (Array.isArray(allSessions)) {
        const obj = {};
        allSessions.forEach(s => {
            const d = s.date || "Unknown";
            if (!obj[d]) obj[d] = { summary: s.summary, tabs: [] };
            obj[d].tabs = mergeAndDeduplicate(obj[d].tabs, s.tabs);
        });
        allSessions = obj;
        needsSave = true;
    }

    // Explicitly rename any "Untitled Session" or "Session list" to "Session List"
    for (const key in allSessions) {
        if (allSessions[key].summary === "Untitled Session" || 
            allSessions[key].summary === "Work Session" || 
            allSessions[key].summary === "Session list") {
            allSessions[key].summary = "Session List";
            needsSave = true;
        }
    }

    if (needsSave) {
        await browser.storage.local.set({ sessions: allSessions });
    }

    const dates = Object.keys(allSessions).sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) {
        list.innerHTML = '<div class="loading-spinner">No sessions captured.</div>';
        return;
    }

    list.innerHTML = '';
    dates.slice(0, 3).forEach(date => {
        const session = allSessions[date];
        const card = document.createElement('div');
        card.className = 'session-card';
        card.id = `card-${date}`;
        
        card.innerHTML = `
            <button class="delete-session-btn" title="Delete day" data-date="${date}">&times;</button>
            <div class="session-header">
                <span class="session-title">${session.summary || `Session List`}</span>
                <span class="session-date">${date} • ${session.tabs.length} tabs unique</span>
            </div>
            <div class="tab-list">
                ${session.tabs.map(tab => `
                    <div class="tab-item">
                        <input type="checkbox" data-url="${tab.url}" checked>
                        <a href="${tab.url}" class="tab-link" title="${tab.url}" target="_blank">${tab.title}</a>
                    </div>
                `).join('')}
                <button class="reopen-selected-btn primary-btn" style="margin-top:10px; padding: 8px; font-size: 0.85rem;">Reopen Selected</button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON') {
                card.classList.toggle('expanded');
            }
        });

        const deleteBtn = card.querySelector('.delete-session-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const dateToDelete = deleteBtn.getAttribute('data-date');
            
            card.style.opacity = '0.3';
            card.style.pointerEvents = 'none';
            
            const s = await browser.storage.local.get('sessions');
            const newSessions = { ...s.sessions };
            delete newSessions[dateToDelete];
            await browser.storage.local.set({ sessions: newSessions });
            card.remove();
            loadSessions();
        });

        card.querySelector('.reopen-selected-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const checked = card.querySelectorAll('input:checked');
            checked.forEach(cb => {
                browser.tabs.create({ url: cb.getAttribute('data-url') });
            });
        });

        list.appendChild(card);
    });

    if (dates.length > 3) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'text-btn';
        moreBtn.textContent = `Show ${dates.length - 3} more days in Manager...`;
        moreBtn.style.width = '100%';
        moreBtn.addEventListener('click', () => {
            browser.tabs.create({ url: "manager.html" });
        });
        list.appendChild(moreBtn);
    }
}

async function exportAllAsBackup() {
    const storage = await browser.storage.local.get('sessions');
    const blob = new Blob([JSON.stringify(storage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    try {
        await browser.downloads.download({
            url: url,
            filename: `tab-catcher-full-backup-${new Date().getTime()}.json`,
            saveAs: true
        });
    } catch (e) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `tab-catcher-full-backup-${new Date().getTime()}.json`;
        a.click();
    }
}

function resetBtn() {
    const captureBtn = document.getElementById('captureBtn');
    captureBtn.disabled = false;
    captureBtn.innerHTML = '<span class="icon">📥</span> Capture & Close All Tabs';
}
