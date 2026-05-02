// ============================================================
// Vibathon Background Service Worker v3.0 — Fully Self-Contained
// ============================================================

import { Storage } from './utils/storage.js';

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
        // Secure IV Generation per encryption
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
        await chrome.storage.local.set({ [\`vault_\${id}\`]: encrypted });
    },
    async getSecret(id) {
        const stored = await chrome.storage.local.get(\`vault_\${id}\`);
        const encObj = stored[\`vault_\${id}\`];
        if (!encObj) return '';
        return this.decrypt(encObj);
    }
};

console.log('Vibathon Background SW v3.0 Initialized');

// Helper to get session state securely
async function getSessionState() {
    const data = await chrome.storage.session.get(['isRecording', 'recordedEvents', 'automationProgress']);
    return {
        isRecording: data.isRecording || false,
        recordedEvents: data.recordedEvents || [],
        automationProgress: data.automationProgress || null
    };
}

async function setSessionState(updates) {
    await chrome.storage.session.set(updates);
}

// ============ KEEP ALIVE ============
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        // Alarms just keep the SW awake, session storage handles state naturally
    }
});

// ============ MESSAGE LISTENER ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message Received:', message.type);
    handleBackgroundMessage(message, sender).then(sendResponse).catch(err => {
        console.error("Handler error:", err);
        sendResponse({ success: false, error: err.message });
    });
    return true; // Keep message channel open for async response
});

async function handleBackgroundMessage(message, sender) {
    const state = await getSessionState();

    switch (message.type) {
        case "PING":
            return { alive: true };

        case "START_RECORDING":
            await setSessionState({ isRecording: true, recordedEvents: [], automationProgress: null });
            await chrome.storage.local.remove('vibathon_resume_steps');
            broadcastToTabs({ type: "START_RECORDING" });
            return { success: true };

        case "STOP_RECORDING":
            await setSessionState({ isRecording: false });
            broadcastToTabs({ type: "STOP_RECORDING" });
            return { events: state.recordedEvents };

        case "RECORD_EVENT":
            if (state.isRecording && message.event) {
                const event = {
                    ...message.event,
                    recordedAt: Date.now(),
                    tabId: sender.tab?.id,
                    pageUrl: sender.tab?.url
                };
                
                if (event.isSensitive && event.value) {
                    try {
                        event.encryptedValue = await Vault.encrypt(event.value);
                        event.value = '••••••••'; // Mask plaintext
                    } catch(e) {
                        console.error('Encryption failed', e);
                    }
                }
                const updatedEvents = [...state.recordedEvents, event];
                await setSessionState({ recordedEvents: updatedEvents });
            }
            return { success: true };

        case "GET_RECORDING":
            return { events: state.recordedEvents, isRecording: state.isRecording };

        case "CLEAR_RECORDING":
            await setSessionState({ isRecording: false, recordedEvents: [], automationProgress: null });
            return { success: true };

        case "ANALYZE_WORKFLOW":
            try {
                const result = await analyzeWithGemini(message.rawData);
                return result;
            } catch (err) {
                return { error: err.message };
            }

        case "RUN_AUTOMATION":
            return await handleRunAutomation(message);

        case "AUTOMATION_PROGRESS":
            await setSessionState({ automationProgress: {
                stepIndex: message.stepIndex,
                totalSteps: message.totalSteps,
                description: message.description,
                status: message.status
            }});
            return { success: true };

        case "GET_PROGRESS":
            return { progress: state.automationProgress };

        case "SAVE_WORKFLOW":
            await Storage.saveWorkflow(message.workflow);
            return { success: true };

        case "UPDATE_WORKFLOW":
            await Storage.saveWorkflow(message.workflow); // Storage.saveWorkflow handles updates
            return { success: true };

        case "GET_HISTORY":
            const history = await Storage.loadWorkflows();
            return { history };

        case "DELETE_WORKFLOW":
            await Storage.deleteWorkflow(message.id);
            return { success: true };

        case "CLEAR_RESUME":
            await chrome.storage.local.remove('vibathon_resume_steps');
            return { success: true };

        case "TEST_API":
            return await testApiConnection();

        case "ENCRYPT_VALUE":
            try {
                const enc = await Vault.encrypt(message.value);
                return { success: true, encrypted: enc };
            } catch (err) {
                return { success: false, error: err.message };
            }

        case "DECRYPT_VALUE":
            try {
                const val = await Vault.decrypt(message.encrypted);
                return { success: true, value: val };
            } catch (err) {
                return { success: false, error: err.message };
            }

        case "SAVE_SECRET":
            try {
                await Vault.saveSecret(message.id, message.value);
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }

        case "GET_SECRET":
            try {
                const val = await Vault.getSecret(message.id);
                return { success: true, value: val };
            } catch (err) {
                return { success: false, error: err.message };
            }

        default:
            return { error: "Unknown message type: " + message.type };
    }
}

// ============ AUTOMATION HANDLER ============
async function handleRunAutomation(message) {
    const steps = message.steps;
    if (!steps || steps.length === 0) {
        return { success: false, error: "No steps to execute" };
    }

    await setSessionState({ automationProgress: { stepIndex: 0, totalSteps: steps.length, description: 'Starting...', status: 'starting' } });

    try {
        // Check if first step is navigate — handle from background
        if (steps[0].action === 'navigate') {
            const url = steps[0].url || steps[0].metadata?.url;
            if (url) {
                const remaining = steps.slice(1);
                // Save remaining steps for resume
                if (remaining.length > 0) {
                    await chrome.storage.local.set({ vibathon_resume_steps: remaining });
                }

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
                
                return { success: true };
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
            return { success: false, error: "No valid tab found and no URL to open. Open a web page first." };
        }

        await chrome.tabs.update(tabId, { active: true });

        // Ensure content script is injected
        const ping = await new Promise(r => {
            chrome.tabs.sendMessage(tabId, { type: "PING" }, (resp) => {
                if (chrome.runtime.lastError) r(null);
                else r(resp);
            });
        });
        
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

        await new Promise(r => {
            chrome.tabs.sendMessage(tabId, { type: "START_AUTOMATION", steps: decryptedSteps }, (resp) => {
                if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
                r(resp);
            });
        });
        
        return { success: true };
    } catch (err) {
        console.error("Automation error:", err);
        return { success: false, error: "Automation failed: " + err.message };
    }
}

// ============ HELPERS ============
function broadcastToTabs(msg) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
                chrome.tabs.sendMessage(tab.id, msg, (response) => {
                    if (chrome.runtime.lastError) {
                        // Suppress warnings for broadcast since some tabs naturally don't have content scripts
                    }
                });
            }
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

    let summary = \`Workflow with \${steps.length} steps\`;
    let flowchart = steps.map((s, i) => \`Step \${i+1}: \${s.description}\`).join('\\n→ ');
    let thinking = \`This workflow has \${steps.length} actions. Each step was recorded from your browser activity.\`;

    const apiKey = await Storage.getApiKey();
    if (apiKey) {
        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
        for (const model of modelsToTry) {
            try {
                const url = API_URL.replace(/gemini-[a-zA-Z0-9.\\-]+(?=:)/, model);
                const prompt = {
                    contents: [{ parts: [{ text: \`You are an AI workflow analyzer. Analyze these browser automation steps and provide:
1. A one-sentence summary of what the workflow does
2. A simple flowchart showing the flow
3. Your thinking/reasoning about what each step does and why

Steps: \${JSON.stringify(steps.map(s => s.description))}

Return ONLY this JSON:
{"summary":"one sentence summary of the full workflow","flowchart":"Start → step1 → step2 → End","thinking":"Explain what this workflow does step by step and why each step matters"}\` }] }],
                    generationConfig: { responseMimeType: "application/json" }
                };
                const response = await fetch(\`\${url}?key=\${apiKey}\`, {
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
    } else {
        return { error: 'No API Key configured. Please add one in Settings.' };
    }

    return { summary, flowchart, thinking, steps };
}

function describeEvent(e) {
    const s = e.selectors || {};
    const label = s.ariaLabel || s.text || s.attributes?.name || s.attributes?.placeholder || s.css || 'element';
    const friendlyUrl = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch(x) { return url || 'page'; } };

    switch(e.action) {
        case 'click':       return \`Click on "\${label}"\`;
        case 'type':        return \`Type "\${e.value || ''}" into "\${label}"\`;
        case 'navigate':    return \`Open \${friendlyUrl(e.url || e.metadata?.url)}\`;
        case 'press_enter': return \`Press Enter on "\${label}"\`;
        case 'scroll':      return \`Scroll page\`;
        case 'select':      return \`Select "\${e.value}"\`;
        case 'check':       return \`Check checkbox\`;
        case 'uncheck':     return \`Uncheck checkbox\`;
        default:            return \`\${e.action} on \${label}\`;
    }
}

// ============ TEST API ============
async function testApiConnection() {
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
    const errors = [];
    const apiKey = await Storage.getApiKey();
    if (!apiKey) return { success: false, error: "No API Key configured. Open Settings to set one." };
    
    for (const model of modelsToTry) {
        try {
            const url = API_URL.replace(/gemini-[a-zA-Z0-9.\\-]+(?=:)/, model);
            const response = await fetch(\`\${url}?key=\${apiKey}\`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
            });
            if (response.ok) return { success: true, message: \`✅ Connected using model: \${model}\` };
            else {
                const body = await response.json().catch(() => ({}));
                errors.push(\`\${model}: \${body.error?.message || response.statusText}\`);
            }
        } catch (err) { errors.push(\`\${model}: \${err.message}\`); }
    }
    return { success: false, error: "Failed all models: " + errors.join(" | ") };
}

// ============ TAB UPDATE — re-inject recording ============
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        const state = await getSessionState();
        if (state.isRecording && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { type: "START_RECORDING" }, (resp) => {
                    if (chrome.runtime.lastError) {}
                });
            }, 800);
        }
    }
});