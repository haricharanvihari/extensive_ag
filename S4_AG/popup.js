document.getElementById('fetch-btn').addEventListener('click', async () => {
    const content = document.getElementById('content');
    const loading = document.getElementById('loading');
    
    content.innerHTML = '';
    loading.style.display = 'block';

    try {
        const url = "https://finance.yahoo.com/markets/private-companies/52-week-gainers/?start=0&count=150";
        const response = await fetch(url);
        const text = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        // Fetch ALL rows from the table
        const rows = Array.from(doc.querySelectorAll('table tr')).slice(1); 

        loading.style.display = 'none';

        if (rows.length === 0) {
            content.innerHTML = '<div class="card">No data found. Ensure you are logged in or check the URL.</div>';
            return;
        }

        // Display summary
        const summary = document.createElement('div');
        summary.style.margin = '10px 0';
        summary.style.fontSize = '0.9rem';
        summary.style.color = '#64748b';
        summary.innerText = `Found ${rows.length} companies.`;
        content.appendChild(summary);

        rows.forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 5) {
                const symbol = cols[0].innerText.trim();
                const name = cols[1].innerText.trim();
                const price = cols[2].innerText.trim();
                const change = cols[3].innerText.trim();
                const pct = cols[4].innerText.trim();
                const yearChange = cols[5] ? cols[5].innerText.trim() : "N/A";

                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <div class="company-name">${name}</div>
                            <div class="symbol">${symbol}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="price">${price}</div>
                            <div class="change ${change.startsWith('+') ? 'plus' : 'minus'}">${change} (${pct})</div>
                        </div>
                    </div>
                    <div style="margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 5px; display: flex; justify-content: space-between; font-size: 0.8rem;">
                        <span style="color: #64748b;">52W Change:</span>
                        <span style="font-weight: bold; color: #2563eb;">${yearChange}</span>
                    </div>
                `;
                content.appendChild(card);
            }
        });

        // Create button container after fetch button
        let btnContainer = document.getElementById('btn-container');
        if (!btnContainer) {
            btnContainer = document.createElement('div');
            btnContainer.id = 'btn-container';
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '10px';
            btnContainer.style.margin = '10px 0';
            document.getElementById('fetch-btn').after(btnContainer);
        }
        btnContainer.innerHTML = ''; // Clear previous buttons

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `private_gainers_${dateStr}.json`;

        // Scrape data once for all buttons
        const scrapeData = () => {
            try {
                const results = [];
                rows.forEach(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols && cols.length >= 4) {
                        // Extract just the price from the price column (it often contains % too)
                        const rawPrice = cols[2].textContent.trim();
                        const price = rawPrice.split(/\s+/)[0]; 
                        
                        results.push({
                            symbol: cols[0].textContent.trim(),
                            name: cols[1].textContent.trim(),
                            price: price,
                            change: cols[3].textContent.trim(), // This is the 52W Growth %
                            year_change: cols[3].textContent.trim() // Mapping for UI compatibility
                        });
                    }
                });
                return results;
            } catch (e) {
                console.error('Scraping Error:', e);
                throw new Error('CRITICAL SCRAPE ERROR: ' + e.message);
            }
        };

        // 2. Push to UI Button (localhost:8080)
        const pushBtn = document.createElement('button');
        pushBtn.innerText = 'Push to UI';
        pushBtn.style.background = '#f97316';
        pushBtn.onclick = async () => {
            if (pushBtn.disabled) return;
            pushBtn.disabled = true;
            
            try {
                pushBtn.innerText = 'Scraping...';
                const data = scrapeData();
                
                pushBtn.innerText = 'Sending...';
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); 

                const response = await fetch('http://127.0.0.1:8888/api/save-data', {
                    method: 'POST',
                    body: JSON.stringify(data),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const result = await response.json();
                    pushBtn.style.background = '#10b981';
                    pushBtn.innerText = 'Saved!';
                    console.log('Success:', result.message);
                } else {
                    throw new Error('Server returned ' + response.status);
                }
            } catch (err) {
                console.error('Push Error:', err);
                pushBtn.style.background = '#ef4444';
                pushBtn.innerText = 'Error!';
                alert('Connection Error: ' + err.message);
            } finally {
                setTimeout(() => {
                    pushBtn.disabled = false;
                    pushBtn.style.background = '#f97316';
                    pushBtn.innerText = 'Push to UI';
                }, 4000);
            }
        };
        pushBtn.innerText = 'Push to UI';
        btnContainer.appendChild(pushBtn);

    } catch (error) {
        loading.style.display = 'none';
        content.innerHTML = `<div class="card" style="color: red;">Error: ${error.message}</div>`;
    }
});
