import { summarizeTabs } from './gemini.js';

document.addEventListener('DOMContentLoaded', () => {
    loadSessions();

    document.getElementById('exportAllBtn').addEventListener('click', exportAllData);
    
    // Import Folder logic
    const importBtn = document.getElementById('importFolderBtn');
    const importInput = document.getElementById('importInput');
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleFolderImport);
});

function updateStatus(message, isError = false) {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusText');
    if (!bar || !text) return;
    bar.style.display = 'block';
    text.textContent = message;
    text.style.color = isError ? '#ef4444' : '#10b981';
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

async function loadSessions() {
    const list = document.getElementById('sessionsList');
    const storage = await browser.storage.local.get('sessions');
    let allSessions = storage.sessions || {};
    let needsSave = false;

    // Migration logic for Array and Renaming
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

    // Rename old summaries
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
        list.innerHTML = '<div class="loading-spinner">No sessions found in the database.</div>';
        return;
    }

    list.innerHTML = '';
    dates.forEach((date) => {
        const session = allSessions[date];
        const card = document.createElement('div');
        card.className = 'session-card';
        card.id = `card-manager-${date}`;
        
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
            updateStatus("Session deleted.");
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
}

function processSessionData(allSessions, sessionData, fallbackDate) {
    if (!sessionData || typeof sessionData !== 'object' || !sessionData.tabs || !Array.isArray(sessionData.tabs)) {
        return false;
    }
    const date = sessionData.date || fallbackDate || new Date().toISOString().split('T')[0];
    if (!allSessions[date]) {
        allSessions[date] = { summary: sessionData.summary || `Session List`, tabs: [] };
    }
    allSessions[date].tabs = mergeAndDeduplicate(allSessions[date].tabs, sessionData.tabs);
    
    // Support upgrading names during process
    if (sessionData.summary && sessionData.summary !== "Untitled Session" && sessionData.summary !== "Work Session") {
        allSessions[date].summary = sessionData.summary;
    } else if (!allSessions[date].summary) {
        allSessions[date].summary = "Session List";
    }

    return true;
}

async function handleFolderImport(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) {
        updateStatus("No files selected.", true);
        return;
    }

    const storage = await browser.storage.local.get('sessions') || {};
    let allSessions = storage.sessions || {};
    
    // Migration helper
    if (Array.isArray(allSessions)) {
        const obj = {};
        allSessions.forEach(s => {
            const d = s.date || "Unknown";
            if (!obj[d]) obj[d] = { summary: s.summary, tabs: [] };
            obj[d].tabs = mergeAndDeduplicate(obj[d].tabs, s.tabs);
        });
        allSessions = obj;
    }

    let successCount = 0;
    let failCount = 0;
    
    updateStatus(`Reading ${files.length} files...`);

    for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.json')) continue;
        try {
            updateStatus(`Parsing ${file.name}...`);
            const text = await file.text();
            let data = JSON.parse(text);
            const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
            const fallbackDate = dateMatch ? dateMatch[1] : null;

            if (data.sessions) {
                if (Array.isArray(data.sessions)) {
                    data.sessions.forEach(s => {
                        if (processSessionData(allSessions, s, fallbackDate)) successCount++;
                        else failCount++;
                    });
                } else if (typeof data.sessions === 'object') {
                    for (const dateKey in data.sessions) {
                        if (processSessionData(allSessions, data.sessions[dateKey], dateKey)) successCount++;
                        else failCount++;
                    }
                }
            } else if (data.tabs && Array.isArray(data.tabs)) {
                if (processSessionData(allSessions, data, fallbackDate)) successCount++;
                else failCount++;
            } else { failCount++; }
        } catch (e) { failCount++; }
    }

    try {
        updateStatus("Saving...");
        await browser.storage.local.set({ sessions: allSessions });
        updateStatus(`Consolidated! Success: ${successCount}.`);
        loadSessions();
    } catch (storageErr) {
        updateStatus("Error saving.", true);
    }
    event.target.value = '';
}

async function exportAllData() {
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
    updateStatus("Backup started.");
}
