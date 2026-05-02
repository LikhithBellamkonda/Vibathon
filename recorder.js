// Vibathon Recorder Controller v3.0
let currentEvents = [];
let currentSteps = [];
let currentThinking = '';
let currentSummary = '';
let isRecording = false;
let editingWorkflowId = null;
let isSecuredWorkflow = false;

const views = {
    dashboard: document.getElementById('dashboardView'),
    history: document.getElementById('historyView'),
    security: document.getElementById('securityView')
};
const navItems = document.querySelectorAll('.nav-item');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const eventCountEl = document.getElementById('eventCount');
const activityFeed = document.getElementById('activityFeed');
const analysisSection = document.getElementById('analysisSection');
const flowchartVisual = document.getElementById('flowchartVisual');
const historyList = document.getElementById('historyList');
const saveWorkflowBtn = document.getElementById('saveWorkflowBtn');
const workflowNameInput = document.getElementById('workflowNameInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiBtn = document.getElementById('saveApiBtn');
const thinkingPanel = document.getElementById('thinkingPanel');
const thinkingText = document.getElementById('thinkingText');
const summaryPanel = document.getElementById('summaryPanel');
const summaryText = document.getElementById('summaryText');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

const ACTION_COLORS = {
    click: '#6366f1', type: '#10b981', navigate: '#f59e0b',
    press_enter: '#ef4444', scroll: '#64748b', select: '#06b6d4',
    check: '#8b5cf6', uncheck: '#8b5cf6'
};
const ACTION_ICONS = {
    click: '👆', type: '⌨️', navigate: '🌐',
    press_enter: '↵', scroll: '📜', select: '📋',
    check: '☑️', uncheck: '☐'
};

function friendlyUrl(url) {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch(e) { return url || 'page'; }
}

// ===== NAVIGATION =====
function initNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
}

function switchView(viewName) {
    Object.keys(views).forEach(v => {
        if (views[v]) views[v].style.display = v === viewName ? 'block' : 'none';
    });
    navItems.forEach(nav => nav.classList.toggle('active', nav.dataset.view === viewName));
    if (viewName === 'history') loadHistory();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    chrome.storage.local.get(['gemini_api_key'], (data) => {
        if (data.gemini_api_key && apiKeyInput) apiKeyInput.value = data.gemini_api_key;
    });
    setupButtonHandlers();
    setupFaceRecognition();
    checkInitialStatus();
    startActivityPolling();
    loadFaceEnrollmentState();
});

function setupButtonHandlers() {
    if (saveApiBtn) {
        saveApiBtn.onclick = () => {
            chrome.storage.local.set({ gemini_api_key: apiKeyInput.value }, () => {
                alert("API Key saved!");
            });
        };
    }

    if (startBtn) {
        startBtn.onclick = async () => {
            editingWorkflowId = null;
            await chrome.runtime.sendMessage({ type: "START_RECORDING" });
            updateUI('recording');
        };
    }

    if (stopBtn) {
        stopBtn.onclick = async () => {
            updateUI('processing');
            const res = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
            currentEvents = res.events;
            if (currentEvents.length > 0) {
                analyzeWorkflow(currentEvents);
            } else {
                updateUI('idle');
            }
        };
    }

    if (clearBtn) {
        clearBtn.onclick = () => {
            chrome.runtime.sendMessage({ type: "CLEAR_RECORDING" });
            currentEvents = [];
            currentSteps = [];
            editingWorkflowId = null;
            if (analysisSection) analysisSection.style.display = 'none';
            updateEventsUI();
        };
    }

    if (saveWorkflowBtn) {
        saveWorkflowBtn.onclick = async () => {
            const workflow = {
                name: workflowNameInput.value,
                steps: currentSteps,
                thinking: currentThinking,
                summary: currentSummary,
                createdAt: Date.now(),
                startUrl: getStartUrl(),
                requiresFaceAuth: isSecuredWorkflow
            };
            if (editingWorkflowId) {
                workflow.id = editingWorkflowId;
                await chrome.runtime.sendMessage({ type: "UPDATE_WORKFLOW", workflow });
                alert("Workflow updated!");
            } else {
                await chrome.runtime.sendMessage({ type: "SAVE_WORKFLOW", workflow });
                alert("Workflow saved!");
            }
        };
    }

    const securityToggle = document.getElementById('securityToggle');
    if (securityToggle) {
        securityToggle.onchange = (e) => {
            isSecuredWorkflow = e.target.checked;
        };
    }

    if (runBtn) {
        runBtn.onclick = () => runAutomation(currentSteps);
    }

    if (document.getElementById('testApiBtn')) {
        document.getElementById('testApiBtn').onclick = testApi;
    }
}

function getStartUrl() {
    if (currentSteps.length > 0 && currentSteps[0].action === 'navigate') return currentSteps[0].url;
    if (currentEvents.length > 0) return currentEvents[0].pageUrl;
    return null;
}

async function checkInitialStatus() {
    try {
        const res = await chrome.runtime.sendMessage({ type: "GET_RECORDING" });
        if (res) {
            currentEvents = res.events || [];
            isRecording = res.isRecording;
            updateUI(isRecording ? 'recording' : 'idle');
            updateEventsUI();
        }
    } catch (err) {
        console.warn('Status check failed:', err);
    }
}

function updateUI(state) {
    if (state === 'recording') {
        statusText.textContent = "Recording Active";
        statusDot.className = "status-dot recording";
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
    } else if (state === 'processing') {
        statusText.textContent = "AI is Analyzing...";
        statusDot.className = "status-dot active";
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
    } else {
        statusText.textContent = "System Ready";
        statusDot.className = "status-dot active";
        startBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
    }
}

// ===== ACTIVITY POLLING =====
function startActivityPolling() {
    setInterval(async () => {
        try {
            const res = await chrome.runtime.sendMessage({ type: "GET_RECORDING" });
            if (res && res.events.length !== currentEvents.length) {
                currentEvents = res.events;
                updateEventsUI();
            }
        } catch(e) {}
    }, 1200);
}

function updateEventsUI() {
    eventCountEl.textContent = currentEvents.length;
    if (currentEvents.length === 0) {
        activityFeed.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">No events yet. Start recording.</div>';
        return;
    }
    activityFeed.innerHTML = currentEvents.map((e, i) => {
        const color = ACTION_COLORS[e.action] || '#888';
        const icon = ACTION_ICONS[e.action] || '•';
        let desc = '';
        if (e.action === 'navigate') desc = `Open ${friendlyUrl(e.url)}`;
        else if (e.action === 'type') desc = `Type "${(e.value || '').substring(0, 30)}"`;
        else desc = e.selectors?.ariaLabel || e.selectors?.text?.substring(0, 30) || e.selectors?.attributes?.placeholder || 'element';
        return `<div class="event-item">
            <span class="event-badge" style="background:${color}18;color:${color};">${icon} ${e.action}</span>
            <span class="event-desc">${desc}</span>
        </div>`;
    }).reverse().join('');
}

// ===== AI ANALYSIS =====
async function analyzeWorkflow(events) {
    try {
        const deduped = events.filter((e, i) => {
            if (e.action === 'click') {
                const next = events[i + 1];
                if (next && next.action === 'navigate' && Math.abs((next.recordedAt||0) - (e.recordedAt||0)) < 500) return false;
            }
            return true;
        });
        const res = await chrome.runtime.sendMessage({ type: "ANALYZE_WORKFLOW", rawData: deduped });
        if (res && res.error) {
            alert("Analysis Error: " + res.error);
            updateUI('idle');
            return;
        }
        if (res && res.steps) {
            currentSteps = res.steps;
            currentThinking = res.thinking || '';
            currentSummary = res.summary || '';
            renderVisualFlowchart();
            updateUI('idle');
        } else {
            throw new Error("Invalid AI response");
        }
    } catch (err) {
        alert("Analysis failed: " + err.message);
        updateUI('idle');
    }
}

// ===== VISUAL FLOWCHART RENDERER =====
function renderVisualFlowchart() {
    analysisSection.style.display = 'block';

    // Show thinking
    if (currentThinking) {
        thinkingPanel.style.display = 'block';
        thinkingText.textContent = currentThinking;
    } else {
        thinkingPanel.style.display = 'none';
    }

    // Show summary
    if (currentSummary) {
        summaryPanel.style.display = 'block';
        summaryText.textContent = currentSummary;
    } else {
        summaryPanel.style.display = 'none';
    }

    buildFlowchartNodes();
}

function buildFlowchartNodes() {
    flowchartVisual.innerHTML = '';

    // START terminal
    const startNode = document.createElement('div');
    startNode.className = 'flow-terminal start';
    startNode.textContent = '▶ START';
    flowchartVisual.appendChild(startNode);

    currentSteps.forEach((step, i) => {
        // Connector
        const conn = document.createElement('div');
        conn.className = 'flow-connector';
        flowchartVisual.appendChild(conn);

        // Add button between steps
        const addBtn = document.createElement('button');
        addBtn.className = 'flow-add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add step here';
        addBtn.onclick = () => addStepAt(i);
        flowchartVisual.appendChild(addBtn);

        const conn2 = document.createElement('div');
        conn2.className = 'flow-connector';
        flowchartVisual.appendChild(conn2);

        // Node
        const node = createFlowNode(step, i);
        flowchartVisual.appendChild(node);
    });

    // Connector + Add at end
    const connEnd = document.createElement('div');
    connEnd.className = 'flow-connector';
    flowchartVisual.appendChild(connEnd);

    const addEndBtn = document.createElement('button');
    addEndBtn.className = 'flow-add-btn';
    addEndBtn.textContent = '+';
    addEndBtn.title = 'Add step at end';
    addEndBtn.onclick = () => addStepAt(currentSteps.length);
    flowchartVisual.appendChild(addEndBtn);

    const connEnd2 = document.createElement('div');
    connEnd2.className = 'flow-connector';
    flowchartVisual.appendChild(connEnd2);

    // END terminal
    const endNode = document.createElement('div');
    endNode.className = 'flow-terminal end';
    endNode.textContent = '⏹ END';
    flowchartVisual.appendChild(endNode);
}

function createFlowNode(step, index) {
    const color = ACTION_COLORS[step.action] || '#888';
    const icon = ACTION_ICONS[step.action] || '•';

    const node = document.createElement('div');
    node.className = 'flow-node';
    node.draggable = true;
    node.dataset.index = index;
    node.style.borderLeftColor = color;
    node.style.borderLeftWidth = '3px';

    // Header
    const header = document.createElement('div');
    header.className = 'flow-node-header';

    const badges = document.createElement('div');
    badges.className = 'flow-node-badges';
    badges.innerHTML = `
        <span class="flow-step-num">STEP ${index + 1}</span>
        <span class="flow-action-badge" style="background:${color}18;color:${color};">${icon} ${step.action}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'flow-node-actions';

    const moveUpBtn = document.createElement('button');
    moveUpBtn.textContent = '↑';
    moveUpBtn.title = 'Move up';
    moveUpBtn.onclick = (e) => { e.stopPropagation(); moveStep(index, -1); };

    const moveDownBtn = document.createElement('button');
    moveDownBtn.textContent = '↓';
    moveDownBtn.title = 'Move down';
    moveDownBtn.onclick = (e) => { e.stopPropagation(); moveStep(index, 1); };

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete step';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteStep(index); };

    actions.appendChild(moveUpBtn);
    actions.appendChild(moveDownBtn);
    actions.appendChild(delBtn);

    header.appendChild(badges);
    header.appendChild(actions);
    node.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'flow-node-body';

    // Action type dropdown
    const actionLabel = document.createElement('label');
    actionLabel.textContent = 'Action Type';
    body.appendChild(actionLabel);
    const actionSelect = document.createElement('select');
    ['click', 'type', 'navigate', 'press_enter', 'select', 'check', 'uncheck', 'scroll'].forEach(act => {
        const opt = document.createElement('option');
        opt.value = act;
        opt.textContent = (ACTION_ICONS[act] || '') + ' ' + act;
        if (act === step.action) opt.selected = true;
        actionSelect.appendChild(opt);
    });
    actionSelect.onchange = () => {
        currentSteps[index].action = actionSelect.value;
        if (actionSelect.value === 'navigate' && !currentSteps[index].url) {
            currentSteps[index].url = 'https://';
        }
        buildFlowchartNodes(); // Rebuild to show correct fields
    };
    body.appendChild(actionSelect);

    // Description
    const descLabel = document.createElement('label');
    descLabel.textContent = 'Description';
    body.appendChild(descLabel);
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.value = step.description || '';
    descInput.placeholder = 'What does this step do?';
    descInput.onchange = () => { currentSteps[index].description = descInput.value; };
    body.appendChild(descInput);

    // Action-specific fields
    if (step.action === 'navigate') {
        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'URL';
        body.appendChild(urlLabel);
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = step.url || '';
        urlInput.placeholder = 'https://example.com';
        urlInput.onchange = () => { currentSteps[index].url = urlInput.value; };
        body.appendChild(urlInput);

        const friendlyDiv = document.createElement('div');
        friendlyDiv.style.cssText = 'margin-top:6px;padding:8px 12px;background:rgba(245,158,11,0.1);border-radius:8px;color:#f59e0b;font-size:0.85rem;display:flex;align-items:center;gap:8px;';
        friendlyDiv.innerHTML = `🌐 Opens <strong>${friendlyUrl(step.url)}</strong> automatically`;
        body.appendChild(friendlyDiv);
    } else {
        // Selector info
        const selLabel = document.createElement('label');
        selLabel.textContent = 'Target Element';
        body.appendChild(selLabel);
        const selInfo = document.createElement('div');
        selInfo.style.cssText = 'font-size:0.78rem;color:var(--text-dim);margin-top:4px;padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const sel = step.selectors || {};
        selInfo.textContent = sel.ariaLabel || sel.text?.substring(0, 40) || sel.attributes?.placeholder || sel.attributes?.name || 'Auto-detected element';
        body.appendChild(selInfo);
    }

    if (step.action === 'type') {
        const valLabel = document.createElement('label');
        valLabel.textContent = step.isSensitive ? '🔒 Password (Encrypted)' : 'Text to type';
        body.appendChild(valLabel);
        const valInput = document.createElement('input');
        valInput.type = step.isSensitive ? 'password' : 'text';
        valInput.value = step.value || '';
        valInput.placeholder = step.isSensitive ? 'Encrypted — will be decrypted at runtime' : 'Text value';
        valInput.onchange = () => { currentSteps[index].value = valInput.value; };
        body.appendChild(valInput);
        if (step.isSensitive) {
            const encBadge = document.createElement('div');
            encBadge.style.cssText = 'margin-top:4px;font-size:0.72rem;color:var(--success);';
            encBadge.textContent = '🔐 AES-256-GCM encrypted';
            body.appendChild(encBadge);
        }
    }

    if (step.action === 'select') {
        const valLabel = document.createElement('label');
        valLabel.textContent = 'Selection value';
        body.appendChild(valLabel);
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.value = step.value || '';
        valInput.onchange = () => { currentSteps[index].value = valInput.value; };
        body.appendChild(valInput);
    }

    node.appendChild(body);

    // Drag and drop
    node.addEventListener('dragstart', (e) => {
        node.classList.add('dragging');
        e.dataTransfer.setData('text/plain', index);
    });
    node.addEventListener('dragend', () => { node.classList.remove('dragging'); });
    node.addEventListener('dragover', (e) => { e.preventDefault(); node.classList.add('drag-over'); });
    node.addEventListener('dragleave', () => { node.classList.remove('drag-over'); });
    node.addEventListener('drop', (e) => {
        e.preventDefault();
        node.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        if (fromIndex !== toIndex) {
            const [moved] = currentSteps.splice(fromIndex, 1);
            currentSteps.splice(toIndex, 0, moved);
            buildFlowchartNodes();
        }
    });

    return node;
}

// ===== STEP MANIPULATION =====
function moveStep(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentSteps.length) return;
    const [moved] = currentSteps.splice(index, 1);
    currentSteps.splice(newIndex, 0, moved);
    buildFlowchartNodes();
}

function deleteStep(index) {
    currentSteps.splice(index, 1);
    buildFlowchartNodes();
}

function addStepAt(index) {
    const newStep = {
        action: 'click',
        selectors: { css: '', ariaLabel: '', text: '', attributes: {} },
        metadata: { tagName: 'button', url: window.location?.href || '' },
        value: null,
        url: null,
        description: 'New step — edit me'
    };
    currentSteps.splice(index, 0, newStep);
    buildFlowchartNodes();
}

// ===== HISTORY =====
async function loadHistory() {
    const res = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
    if (!res || !res.history || res.history.length === 0) {
        historyList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">No saved workflows.</div>';
        return;
    }

    historyList.innerHTML = res.history.map(w => {
        const stepCount = w.steps?.length || 0;
        const date = new Date(w.createdAt).toLocaleDateString();
        const startSite = w.startUrl ? friendlyUrl(w.startUrl) : '';
        const isSecured = w.requiresFaceAuth;
        return `
        <div class="history-item" data-id="${w.id}">
            <div>
                <h3 style="margin-bottom:4px;">${isSecured ? '🔒 ' : ''}${w.name || 'Untitled'}</h3>
                <div style="font-size:0.8rem;color:var(--text-dim);">
                    ${stepCount} steps • ${date}${startSite ? ' • ' + startSite : ''}${isSecured ? ' • 🛡️ Secured' : ''}
                </div>
            </div>
            <div class="history-actions">
                <button class="btn ${isSecured ? 'btn-warning' : 'btn-ghost'} btn-sm lock-hist-btn" data-id="${w.id}" title="${isSecured ? 'Remove security' : 'Enable face lock'}">${isSecured ? '🔒' : '🔓'}</button>
                <button class="btn btn-success btn-sm run-hist-btn" data-id="${w.id}">🚀 Run</button>
                <button class="btn btn-warning btn-sm edit-hist-btn" data-id="${w.id}">✏️ Edit</button>
                <button class="btn btn-ghost btn-sm del-hist-btn" data-id="${w.id}">🗑️</button>
            </div>
        </div>`;
    }).join('');

    // Lock/unlock buttons
    document.querySelectorAll('.lock-hist-btn').forEach(btn => {
        btn.onclick = async () => {
            const id = parseInt(btn.dataset.id);
            const wf = res.history.find(w => w.id === id);
            if (wf) {
                wf.requiresFaceAuth = !wf.requiresFaceAuth;
                await chrome.runtime.sendMessage({ type: "UPDATE_WORKFLOW", workflow: wf });
                loadHistory(); // Refresh
            }
        };
    });

    // Run buttons
    document.querySelectorAll('.run-hist-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseInt(btn.dataset.id);
            const wf = res.history.find(w => w.id === id);
            if (wf) runAutomation(wf.steps, wf.startUrl, { requiresFaceAuth: wf.requiresFaceAuth });
        };
    });

    // Edit buttons
    document.querySelectorAll('.edit-hist-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseInt(btn.dataset.id);
            const wf = res.history.find(w => w.id === id);
            if (wf) editWorkflow(wf);
        };
    });

    // Delete buttons
    document.querySelectorAll('.del-hist-btn').forEach(btn => {
        btn.onclick = async () => {
            if (confirm("Delete this workflow?")) {
                const id = parseInt(btn.dataset.id);
                await chrome.runtime.sendMessage({ type: "DELETE_WORKFLOW", id });
                loadHistory();
            }
        };
    });
}

function editWorkflow(workflow) {
    editingWorkflowId = workflow.id;
    currentSteps = JSON.parse(JSON.stringify(workflow.steps || []));
    currentThinking = workflow.thinking || '';
    currentSummary = workflow.summary || '';
    isSecuredWorkflow = workflow.requiresFaceAuth || false;
    workflowNameInput.value = workflow.name || 'Untitled';
    if (document.getElementById('securityToggle')) {
        document.getElementById('securityToggle').checked = isSecuredWorkflow;
    }

    switchView('dashboard');
    renderVisualFlowchart();
}

// ===== API TEST =====
async function testApi() {
    const st = document.getElementById('apiStatusText');
    st.textContent = "Testing...";
    st.style.color = "var(--warning)";
    try {
        const res = await chrome.runtime.sendMessage({ type: "TEST_API" });
        if (res.success) {
            st.textContent = res.message;
            st.style.color = "var(--success)";
        } else {
            st.textContent = "❌ " + res.error;
            st.style.color = "var(--danger)";
        }
    } catch (err) {
        st.textContent = "❌ " + err.message;
        st.style.color = "var(--danger)";
    }
}

// ===== AUTOMATION EXECUTION =====
async function runAutomation(steps, historyStartUrl) {
    if (!steps || steps.length === 0) {
        alert('No steps to run.');
        return;
    }

    try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_RESUME' });

        // Show progress
        progressContainer.style.display = 'block';
        progressText.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting automation...';

        // Start progress polling
        const progressPoll = setInterval(async () => {
            try {
                const p = await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' });
                if (p?.progress) {
                    const pct = Math.round((p.progress.stepIndex / p.progress.totalSteps) * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = `Step ${p.progress.stepIndex}/${p.progress.totalSteps}: ${p.progress.description}`;
                    if (p.progress.status === 'complete') {
                        progressFill.style.width = '100%';
                        progressText.textContent = '✅ Automation completed!';
                        clearInterval(progressPoll);
                        setTimeout(() => {
                            progressContainer.style.display = 'none';
                            progressText.style.display = 'none';
                        }, 4000);
                    }
                }
            } catch(e) {}
        }, 800);

        let targetTab = null;
        const allTabs = await chrome.tabs.query({});
        const validTabs = allTabs.filter(t => t.url?.startsWith('http'));

        // Find target tab
        const searchUrl = historyStartUrl || getStartUrl();
        if (searchUrl) {
            try {
                const domain = new URL(searchUrl).hostname;
                targetTab = validTabs.find(t => t.url.includes(domain));
            } catch(e) {}
        }

        if (!targetTab && validTabs.length > 0) {
            validTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
            targetTab = validTabs[0];
        }

        // Determine tabId or let background handle it
        const tabId = targetTab ? targetTab.id : null;

        const res = await chrome.runtime.sendMessage({
            type: 'RUN_AUTOMATION',
            steps,
            tabId,
            startUrl: historyStartUrl || getStartUrl()
        });

        if (res?.success) {
            runBtn.innerHTML = '<span>✅</span> Running...';
            setTimeout(() => { runBtn.innerHTML = '<span>🚀</span> Run Automation'; }, 3000);
        } else {
            clearInterval(progressPoll);
            progressContainer.style.display = 'none';
            progressText.style.display = 'none';
            alert('Automation failed: ' + (res?.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Execution error: ' + err.message);
    }
}

// ===== FACE RECOGNITION MODULE =====
function getImageHash(imageData) {
    // Perceptual hash: resize to 16x16 grayscale, compute average, create binary hash
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageData, 0, 0, 16, 16);
    const pixels = ctx.getImageData(0, 0, 16, 16).data;
    let total = 0;
    const grays = [];
    for (let i = 0; i < pixels.length; i += 4) {
        const gray = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
        grays.push(gray);
        total += gray;
    }
    const avg = total / grays.length;
    return grays.map(g => g > avg ? '1' : '0').join('');
}

function hammingDistance(hash1, hash2) {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 999;
    let dist = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) dist++;
    }
    return dist;
}

function loadFaceEnrollmentState() {
    chrome.storage.local.get(['face_hash', 'face_image'], (data) => {
        const preview = document.getElementById('enrollPreview');
        const faceStatus = document.getElementById('faceStatus');
        if (data.face_hash && preview) {
            if (data.face_image) {
                preview.innerHTML = `<img src="${data.face_image}" style="width:100%;border-radius:12px;">`;
            } else {
                preview.innerHTML = '<div style="padding:20px;color:var(--success);">✅ Face enrolled</div>';
            }
            if (faceStatus) faceStatus.textContent = '✅ Face enrolled and active';
            if (faceStatus) faceStatus.style.color = 'var(--success)';
        }
    });
}

function setupFaceRecognition() {
    const enrollBtn = document.getElementById('enrollFaceBtn');
    const clearFaceBtn = document.getElementById('clearFaceBtn');
    const verifyBtn = document.getElementById('verifyFaceBtn');
    const cancelVerifyBtn = document.getElementById('cancelVerifyBtn');

    if (enrollBtn) {
        enrollBtn.onclick = async () => {
            const video = document.getElementById('enrollVideo');
            const canvas = document.getElementById('enrollCanvas');
            const preview = document.getElementById('enrollPreview');
            const faceStatus = document.getElementById('faceStatus');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
                video.srcObject = stream;
                video.style.display = 'block';
                preview.style.display = 'none';
                faceStatus.textContent = 'Camera active. Click "Capture" when ready...';
                faceStatus.style.color = 'var(--warning)';
                // Change button to capture
                enrollBtn.textContent = '📸 Capture';
                enrollBtn.onclick = () => {
                    canvas.width = video.videoWidth || 320;
                    canvas.height = video.videoHeight || 240;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0);
                    const hash = getImageHash(canvas);
                    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    // Save hash and image
                    chrome.storage.local.set({ face_hash: hash, face_image: imageDataUrl });
                    // Stop camera
                    stream.getTracks().forEach(t => t.stop());
                    video.style.display = 'none';
                    preview.style.display = 'flex';
                    preview.innerHTML = `<img src="${imageDataUrl}" style="width:100%;border-radius:12px;">`;
                    faceStatus.textContent = '✅ Face enrolled successfully!';
                    faceStatus.style.color = 'var(--success)';
                    enrollBtn.textContent = '📷 Re-Enroll';
                    // Re-bind original handler
                    setupFaceRecognition();
                };
            } catch (err) {
                faceStatus.textContent = '❌ Camera access denied: ' + err.message;
                faceStatus.style.color = 'var(--danger)';
            }
        };
    }

    if (clearFaceBtn) {
        clearFaceBtn.onclick = () => {
            chrome.storage.local.remove(['face_hash', 'face_image']);
            const preview = document.getElementById('enrollPreview');
            const faceStatus = document.getElementById('faceStatus');
            if (preview) { preview.innerHTML = 'No face enrolled'; preview.style.display = 'flex'; }
            if (faceStatus) { faceStatus.textContent = 'Face data cleared.'; faceStatus.style.color = 'var(--text-dim)'; }
        };
    }

    if (cancelVerifyBtn) {
        cancelVerifyBtn.onclick = () => {
            closeFaceModal();
        };
    }
}

function hasSensitiveSteps(steps) {
    return steps.some(s => s.isSensitive || (s.action === 'type' && s.selectors?.attributes?.type === 'password'));
}

function openFaceVerifyModal() {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('faceVerifyModal');
        const video = document.getElementById('verifyVideo');
        const canvas = document.getElementById('verifyCanvas');
        const status = document.getElementById('verifyStatus');
        const verifyBtn = document.getElementById('verifyFaceBtn');

        modal.style.display = 'flex';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
            video.srcObject = stream;

            verifyBtn.onclick = () => {
                canvas.width = video.videoWidth || 320;
                canvas.height = video.videoHeight || 240;
                canvas.getContext('2d').drawImage(video, 0, 0);
                const currentHash = getImageHash(canvas);

                chrome.storage.local.get(['face_hash'], (data) => {
                    stream.getTracks().forEach(t => t.stop());
                    if (!data.face_hash) {
                        status.textContent = '⚠️ No face enrolled. Go to Settings to enroll.';
                        status.style.color = 'var(--danger)';
                        setTimeout(() => { closeFaceModal(); resolve(false); }, 2000);
                        return;
                    }
                    const dist = hammingDistance(currentHash, data.face_hash);
                    const threshold = 90; // Out of 256 bits
                    if (dist <= threshold) {
                        status.textContent = '✅ Face verified! Proceeding...';
                        status.style.color = 'var(--success)';
                        setTimeout(() => { closeFaceModal(); resolve(true); }, 1200);
                    } else {
                        status.textContent = `❌ Face not recognized (distance: ${dist}). Access denied.`;
                        status.style.color = 'var(--danger)';
                        setTimeout(() => { closeFaceModal(); resolve(false); }, 2500);
                    }
                });
            };

            document.getElementById('cancelVerifyBtn').onclick = () => {
                stream.getTracks().forEach(t => t.stop());
                closeFaceModal();
                resolve(false);
            };
        } catch (err) {
            status.textContent = '❌ Camera error: ' + err.message;
            status.style.color = 'var(--danger)';
            setTimeout(() => { closeFaceModal(); resolve(false); }, 2000);
        }
    });
}

function closeFaceModal() {
    const modal = document.getElementById('faceVerifyModal');
    const video = document.getElementById('verifyVideo');
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    modal.style.display = 'none';
}

// Override runAutomation to add face verification
const _originalRunAutomation = runAutomation;
runAutomation = async function(steps, historyStartUrl, workflowMeta) {
    // Check if this workflow requires face auth (per-workflow toggle or sensitive steps)
    const needsFace = isSecuredWorkflow || workflowMeta?.requiresFaceAuth || hasSensitiveSteps(steps);
    if (needsFace) {
        const enrolled = await new Promise(r => chrome.storage.local.get(['face_hash'], d => r(!!d.face_hash)));
        if (enrolled) {
            const verified = await openFaceVerifyModal();
            if (!verified) {
                alert('Face verification failed. Automation cancelled.');
                return;
            }
        } else {
            const proceed = confirm('⚠️ This workflow is secured but no face is enrolled.\nGo to Settings → Face Recognition to enroll.\n\nProceed without verification?');
            if (!proceed) return;
        }
    }
    return _originalRunAutomation(steps, historyStartUrl);
};