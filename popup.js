// Popup Controller for Vibathon AI
const statusEl = document.getElementById('status');
const statusIndicator = document.getElementById('statusIndicator');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const openDashboardBtn = document.getElementById('openDashboard');

// Initialize popup state
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await chrome.runtime.sendMessage({ type: "GET_RECORDING" });
        if (response && response.isRecording) {
            updateUI('recording');
        } else {
            updateUI('idle');
        }
    } catch (err) {
        console.error('Error checking status:', err);
        updateUI('idle');
    }
});

startBtn.onclick = async () => {
    try {
        await chrome.runtime.sendMessage({ type: "START_RECORDING" });
        updateUI('recording');
        // Close popup after starting to let user record
        setTimeout(() => window.close(), 1000);
    } catch (err) {
        console.error('Failed to start recording:', err);
    }
};

stopBtn.onclick = async () => {
    updateUI('processing');
    try {
        const response = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
        if (response && response.events && response.events.length > 0) {
            const aiResult = await chrome.runtime.sendMessage({ type: "ANALYZE_WORKFLOW", rawData: response.events });
            if (aiResult && !aiResult.error) {
                await chrome.storage.local.set({ vibathon_pending_analysis: aiResult });
            } else {
                showError(aiResult?.error || "Analysis failed");
                updateUI('idle');
                return;
            }
        }
        chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
        window.close();
    } catch (err) {
        console.error('Failed to stop recording:', err);
        showError(err.message);
        updateUI('idle');
    }
};

openDashboardBtn.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
    window.close();
};

function showError(msg) {
    const errorBox = document.getElementById('errorBox');
    if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
}

function updateUI(state) {
    const loader = document.getElementById('loader');
    const errorBox = document.getElementById('errorBox');
    if (errorBox) errorBox.style.display = 'none';

    if (state === 'recording') {
        statusEl.innerText = 'Recording Active';
        statusIndicator.className = 'status-dot recording';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        loader.style.display = 'none';
    } else if (state === 'processing') {
        statusEl.innerText = 'Processing...';
        statusIndicator.className = 'status-dot active';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        loader.style.display = 'block';
    } else {
        statusEl.innerText = 'System Ready';
        statusIndicator.className = 'status-dot active';
        startBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        loader.style.display = 'none';
    }
}