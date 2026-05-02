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
        // After stopping, open the recorder page for analysis
        chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
        window.close();
    } catch (err) {
        console.error('Failed to stop recording:', err);
        updateUI('idle');
    }
};

openDashboardBtn.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
    window.close();
};

function updateUI(state) {
    if (state === 'recording') {
        statusEl.innerText = 'Recording Active';
        statusIndicator.className = 'status-dot recording';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
    } else if (state === 'processing') {
        statusEl.innerText = 'Processing...';
        statusIndicator.className = 'status-dot active';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
    } else {
        statusEl.innerText = 'System Ready';
        statusIndicator.className = 'status-dot active';
        startBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
    }
}