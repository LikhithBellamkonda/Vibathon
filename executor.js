const AutomationEngine = {
    async run(steps) {
        for (const step of steps) {
            const el = await this.waitForElement(step.selector);
            if (step.action === 'click') { el.click(); }
            else if (step.action === 'type') {
                el.value = (step.value === "{{SECRET}}") ? await Vault.getSecret(step.selector) : step.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        alert("Workflow Completed!");
    },
    async waitForElement(selector) {
        for (let i = 0; i < 20; i++) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise(r => setTimeout(r, 300));
        }
    }
};

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_AUTOMATION") AutomationEngine.run(msg.steps);
});