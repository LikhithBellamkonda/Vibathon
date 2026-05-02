// ============================================================
// Vibathon Background Service Worker v3.0 — Fully Self-Contained
// ============================================================

const CONFIG = {
    GEMINI_API_KEY: "AIzaSyD6doyLCF4FwSlKP4qXKzCw9VuJ5E5n7-k",
    API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
};

// --- Encrypted Vault using AES-GCM ---
const Vault = {
    async _getKey() {
        const stored = await chrome.storage.local.get('vault_key_raw');
        if (stored.vault_key_raw) {
            const raw = new Uint8Array(stored.vault_key_raw);
            return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
        }
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const exported = await crypto.subtle.exportKey('raw', key);
        await chrome.storage.local.set({ vault_key_raw: Array.from(new Uint8Array(exported)) });
        return key;
    },
    async encrypt(plaintext) {
        const key = await this._getKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
    },
    async decrypt(encObj) {
        if (!encObj || !encObj.iv || !encObj.data) return '';
        const key = await this._getKey();
        const iv = new Uint8Array(encObj.iv);
        const data = new Uint8Array(encObj.data);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(plain);
    },
    async saveSecret(id, value) {
        const encrypted = await this.encrypt(value);
        await chrome.storage.local.set({ [`vault_${id}`]: encrypted });
    },
    async getSecret(id) {
        const stored = await chrome.storage.local.get(`vault_${id}`);
        const encObj = stored[`vault_${id}`];
        if (!encObj) return '';
        return this.decrypt(encObj);
    }
};

let recordedEvents = [];
let isRecording = false;
let automationProgress = null;

console.log('Vibathon Background SW v3.0 Initialized');

// ============ KEEP ALIVE ============
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        chrome.storage.local.get(['sw_recordedEvents', 'sw_isRecording'], (data) => {
            if (data.sw_isRecording) {
                isRecording = data.sw_isRecording;
                recordedEvents = data.sw_recordedEvents || [];
            }
        });
    }
});

function persistState() {
    chrome.storage.local.set({ sw_recordedEvents: recordedEvents, sw_isRecording: isRecording });
}

// ============ MESSAGE LISTENER ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message Received:', message.type);

    switch (message.type) {
        case "PING":
            sendResponse({ alive: true });
            break;

        case "START_RECORDING":
            isRecording = true;
            recordedEvents = [];
            automationProgress = null;
            chrome.storage.local.remove('vibathon_resume_steps');
            persistState();
            broadcastToTabs({ type: "START_RECORDING" });
            sendResponse({ success: true });
            break;

        case "STOP_RECORDING":
            isRecording = false;
            broadcastToTabs({ type: "STOP_RECORDING" });
            persistState();
            sendResponse({ events: recordedEvents });
            break;

        case "RECORD_EVENT":
            if (isRecording && message.event) {
                const event = {
                    ...message.event,
                    recordedAt: Date.now(),
                    tabId: sender.tab?.id,
                    pageUrl: sender.tab?.url
                };
                // ENCRYPT password values before storing
                if (event.isSensitive && event.value) {
                    Vault.encrypt(event.value).then(encrypted => {
                        event.encryptedValue = encrypted;
                        event.value = '••••••••'; // Mask the plaintext
                        recordedEvents.push(event);
                        persistState();
                        sendResponse({ success: true });
                    }).catch(() => {
                        recordedEvents.push(event);
                        persistState();
                        sendResponse({ success: true });
                    });
                    return true; // async response
                }
                recordedEvents.push(event);
                persistState();
            }
            sendResponse({ success: true });
            break;

        case "GET_RECORDING":
            sendResponse({ events: recordedEvents, isRecording });
            break;

        case "CLEAR_RECORDING":
            recordedEvents = [];
            isRecording = false;
            automationProgress = null;
            persistState();
            sendResponse({ success: true });
            break;

        case "ANALYZE_WORKFLOW":
            analyzeWithGemini(message.rawData)
                .then(sendResponse)
                .catch(err => sendResponse({ error: err.message }));
            return true;

        case "RUN_AUTOMATION":
            handleRunAutomation(message, sendResponse);
            return true;

        case "AUTOMATION_PROGRESS":
            automationProgress = {
                stepIndex: message.stepIndex,
                totalSteps: message.totalSteps,
                description: message.description,
                status: message.status
            };
            sendResponse({ success: true });
            break;

        case "GET_PROGRESS":
            sendResponse({ progress: automationProgress });
            break;

        case "SAVE_WORKFLOW":
            chrome.storage.local.get({ history: [] }, (data) => {
                const history = data.history || [];
                history.unshift({ id: Date.now(), ...message.workflow });
                chrome.storage.local.set({ history: history.slice(0, 50) }, () => {
                    sendResponse({ success: true });
                });
            });
            return true;

        case "UPDATE_WORKFLOW":
            chrome.storage.local.get({ history: [] }, (data) => {
                const history = (data.history || []).map(w =>
                    w.id === message.workflow.id ? { ...w, ...message.workflow } : w
                );
                chrome.storage.local.set({ history }, () => {
                    sendResponse({ success: true });
                });
            });
            return true;

        case "GET_HISTORY":
            chrome.storage.local.get({ history: [] }, (data) => {
                sendResponse({ history: data.history || [] });
            });
            return true;

        case "DELETE_WORKFLOW":
            chrome.storage.local.get({ history: [] }, (data) => {
                const filtered = (data.history || []).filter(w => w.id !== message.id);
                chrome.storage.local.set({ history: filtered }, () => {
                    sendResponse({ success: true });
                });
            });
            return true;

        case "SET_RESUME_STEPS":
            if (sender.tab && sender.tab.id) {
                chrome.storage.local.set({ [`vibathon_resume_steps_${sender.tab.id}`]: message.steps });
            }
            sendResponse({ success: true });
            break;

        case "GET_RESUME_STEPS":
            if (sender.tab && sender.tab.id) {
                const key = `vibathon_resume_steps_${sender.tab.id}`;
                chrome.storage.local.get(key, (data) => {
                    const steps = data[key];
                    if (steps && steps.length > 0) {
                        chrome.storage.local.remove(key, () => {
                            sendResponse({ steps: steps });
                        });
                    } else {
                        sendResponse({ steps: null });
                    }
                });
                return true;
            }
            sendResponse({ steps: null });
            break;

        case "CLEAR_RESUME_STEPS":
            if (sender.tab && sender.tab.id) {
                chrome.storage.local.remove(`vibathon_resume_steps_${sender.tab.id}`);
            }
            sendResponse({ success: true });
            break;

        case "CLEAR_RESUME":
            chrome.storage.local.get(null, (data) => {
                const keys = Object.keys(data).filter(k => k.startsWith('vibathon_resume_steps_'));
                if (keys.length > 0) chrome.storage.local.remove(keys);
            });
            sendResponse({ success: true });
            break;

        case "TEST_API":
            testApiConnection()
                .then(sendResponse)
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case "ENCRYPT_VALUE":
            Vault.encrypt(message.value)
                .then(enc => sendResponse({ success: true, encrypted: enc }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case "DECRYPT_VALUE":
            Vault.decrypt(message.encrypted)
                .then(val => sendResponse({ success: true, value: val }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case "SAVE_SECRET":
            Vault.saveSecret(message.id, message.value)
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case "GET_SECRET":
            Vault.getSecret(message.id)
                .then(val => sendResponse({ success: true, value: val }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        default:
            sendResponse({ error: "Unknown message type: " + message.type });
            break;
    }
});

// ============ AUTOMATION HANDLER ============
async function handleRunAutomation(message, sendResponse) {
    const steps = message.steps;
    if (!steps || steps.length === 0) {
        sendResponse({ success: false, error: "No steps to execute" });
        return;
    }

    automationProgress = { stepIndex: 0, totalSteps: steps.length, description: 'Starting...', status: 'starting' };

    try {
        // Check if first step is navigate — handle from background
        if (steps[0].action === 'navigate') {
            const url = steps[0].url || steps[0].metadata?.url;
            if (url) {
                // Find or create a tab for the URL
                let targetTab = null;
                if (message.tabId) {
                    try {
                        targetTab = await chrome.tabs.get(message.tabId);
                        await chrome.tabs.update(targetTab.id, { url, active: true });
                    } catch(e) {
                        targetTab = await chrome.tabs.create({ url, active: true });
                    }
                } else {
                    targetTab = await chrome.tabs.create({ url, active: true });
                }

                const remaining = steps.slice(1);
                // Save remaining steps for resume
                if (remaining.length > 0) {
                    await new Promise(r => chrome.storage.local.set({ [`vibathon_resume_steps_${targetTab.id}`]: remaining }, r));
                }
                
                sendResponse({ success: true });
                return;
            }
        }

        // Non-navigate first step — send to target tab
        let tabId = message.tabId;

        if (!tabId) {
            // Try active tab first
            const allTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const validTab = allTabs.find(t => t.url?.startsWith('http'));
            if (validTab) {
                tabId = validTab.id;
            } else {
                // Try any http tab
                const httpTabs = await chrome.tabs.query({});
                const ht = httpTabs.find(t => t.url?.startsWith('http'));
                if (ht) tabId = ht.id;
            }
        }

        // If still no tab, look at the workflow startUrl or first step metadata
        if (!tabId) {
            const startUrl = message.startUrl || steps[0]?.metadata?.url;
            if (startUrl) {
                const newTab = await chrome.tabs.create({ url: startUrl, active: true });
                tabId = newTab.id;
                // Wait for page to load
                await new Promise(resolve => {
                    const listener = (updatedTabId, changeInfo) => {
                        if (updatedTabId === tabId && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            setTimeout(resolve, 1000);
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    setTimeout(resolve, 8000); // Absolute fallback
                });
            }
        }

        if (!tabId) {
            sendResponse({ success: false, error: "No valid tab found and no URL to open. Open a web page first." });
            return;
        }

        await chrome.tabs.update(tabId, { active: true });

        // Ensure content script is injected
        const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" }).catch(() => null);
        if (!ping) {
            await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
            await new Promise(r => setTimeout(r, 800));
        }
        // Decrypt any encrypted password values before sending to content script
        const decryptedSteps = await Promise.all(steps.map(async (step) => {
            if (step.encryptedValue) {
                try {
                    const plainValue = await Vault.decrypt(step.encryptedValue);
                    return { ...step, value: plainValue };
                } catch(e) {
                    console.warn('Failed to decrypt step value:', e);
                    return step;
                }
            }
            return step;
        }));

        await chrome.tabs.sendMessage(tabId, { type: "START_AUTOMATION", steps: decryptedSteps });
        sendResponse({ success: true });
    } catch (err) {
        console.error("Automation error:", err);
        sendResponse({ success: false, error: "Automation failed: " + err.message });
    }
}

// ============ HELPERS ============
function broadcastToTabs(msg) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
                chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
        });
    });
}

async function getApiKey() {
    return new Promise(resolve => {
        chrome.storage.local.get(['gemini_api_key'], data => {
            resolve(data.gemini_api_key || CONFIG.GEMINI_API_KEY);
        });
    });
}

// ============ AI ANALYSIS ============
async function analyzeWithGemini(data) {
    if (!data || data.length === 0) return { error: 'No recording data to analyze.' };

    const steps = data
        .filter(e => ['click', 'type', 'press_enter', 'navigate', 'scroll', 'select', 'check', 'uncheck'].includes(e.action))
        .map(e => ({
            action: e.action,
            selectors: e.selectors || { css: e.selector },
            metadata: e.metadata || { tagName: e.tagName, url: e.url || e.pageUrl },
            value: e.value || null,
            url: e.url || null,
            isSensitive: e.isSensitive || false,
            encryptedValue: e.encryptedValue || null,
            description: describeEvent(e)
        }));

    if (steps.length === 0) return { error: 'No actionable steps found.' };

    let summary = `Workflow with ${steps.length} steps`;
    let flowchart = steps.map((s, i) => `Step ${i+1}: ${s.description}`).join('\n→ ');
    let thinking = `This workflow has ${steps.length} actions. Each step was recorded from your browser activity.`;

    const apiKey = await getApiKey();
    if (apiKey) {
        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
        for (const model of modelsToTry) {
            try {
                const url = CONFIG.API_URL.replace(/gemini-[a-zA-Z0-9.\-]+(?=:)/, model);
                const prompt = {
                    contents: [{ parts: [{ text: `You are an AI workflow analyzer. Analyze these browser automation steps and provide:
1. A one-sentence summary of what the workflow does
2. A simple flowchart showing the flow
3. Your thinking/reasoning about what each step does and why

Steps: ${JSON.stringify(steps.map(s => s.description))}

Return ONLY this JSON:
{"summary":"one sentence summary of the full workflow","flowchart":"Start → step1 → step2 → End","thinking":"Explain what this workflow does step by step and why each step matters"}` }] }],
                    generationConfig: { responseMimeType: "application/json" }
                };
                const response = await fetch(`${url}?key=${apiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(prompt)
                });
                if (response.ok) {
                    const result = await response.json();
                    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        const aiData = JSON.parse(text);
                        summary = aiData.summary || summary;
                        flowchart = aiData.flowchart || flowchart;
                        thinking = aiData.thinking || thinking;
                    }
                    break;
                }
            } catch(e) { continue; }
        }
    }

    return { summary, flowchart, thinking, steps };
}

function describeEvent(e) {
    const s = e.selectors || {};
    const label = s.ariaLabel || s.text || s.attributes?.name || s.attributes?.placeholder || s.css || 'element';
    const friendlyUrl = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch(x) { return url || 'page'; } };

    switch(e.action) {
        case 'click':       return `Click on "${label}"`;
        case 'type':        return `Type "${e.value || ''}" into "${label}"`;
        case 'navigate':    return `Open ${friendlyUrl(e.url || e.metadata?.url)}`;
        case 'press_enter': return `Press Enter on "${label}"`;
        case 'scroll':      return `Scroll page`;
        case 'select':      return `Select "${e.value}"`;
        case 'check':       return `Check checkbox`;
        case 'uncheck':     return `Uncheck checkbox`;
        default:            return `${e.action} on ${label}`;
    }
}

// ============ TEST API ============
async function testApiConnection() {
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
    const errors = [];
    const apiKey = await getApiKey();
    for (const model of modelsToTry) {
        try {
            const url = CONFIG.API_URL.replace(/gemini-[a-zA-Z0-9.\-]+(?=:)/, model);
            const response = await fetch(`${url}?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
            });
            if (response.ok) return { success: true, message: `✅ Connected using model: ${model}` };
            else {
                const body = await response.json().catch(() => ({}));
                errors.push(`${model}: ${body.error?.message || response.statusText}`);
            }
        } catch (err) { errors.push(`${model}: ${err.message}`); }
    }
    return { success: false, error: "Failed all models: " + errors.join(" | ") };
}

// ============ TAB UPDATE — re-inject recording ============
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        if (isRecording && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { type: "START_RECORDING" }).catch(() => {});
            }, 800);
        }
    }
});