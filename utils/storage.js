// utils/storage.js
// Shared utility for chrome.storage operations

export const Storage = {
    async saveWorkflow(workflow) {
        const data = await chrome.storage.local.get({ history: [] });
        const history = data.history || [];
        
        // If it's an update, replace the existing one
        if (workflow.id) {
            const index = history.findIndex(w => w.id === workflow.id);
            if (index !== -1) {
                history[index] = { ...history[index], ...workflow };
            } else {
                history.unshift(workflow);
            }
        } else {
            // New workflow
            workflow.id = Date.now();
            history.unshift(workflow);
        }
        
        await chrome.storage.local.set({ history: history.slice(0, 50) });
        return workflow;
    },

    async loadWorkflows() {
        const data = await chrome.storage.local.get({ history: [] });
        return data.history || [];
    },

    async deleteWorkflow(id) {
        const data = await chrome.storage.local.get({ history: [] });
        const history = data.history || [];
        const filtered = history.filter(w => w.id !== id);
        await chrome.storage.local.set({ history: filtered });
    },
    
    async getApiKey() {
        const data = await chrome.storage.local.get(['apiKey']);
        return data.apiKey || '';
    }
};
