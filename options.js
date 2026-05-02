document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const statusEl = document.getElementById('status');

    // Load existing key
    chrome.storage.local.get(['apiKey'], (data) => {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
        }
    });

    // Save key
    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        
        if (!key) {
            statusEl.textContent = 'Please enter an API key.';
            statusEl.className = 'error';
            return;
        }

        chrome.storage.local.set({ apiKey: key }, () => {
            statusEl.textContent = 'Settings saved successfully!';
            statusEl.className = 'success';
            
            // Clear message after 3 seconds
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = '';
            }, 3000);
        });
    });
});
