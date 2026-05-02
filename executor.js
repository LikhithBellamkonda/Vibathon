const AutomationEngine = {
    async run(steps) {
        for (const step of steps) {
            try {
                const el = await this.waitForElement(step.selector, 5000);
                if (!el) {
                    console.warn(`Element not found for selector: ${step.selector}`);
                    continue;
                }
                
                if (step.action === 'click') { 
                    el.click(); 
                } else if (step.action === 'type') {
                    el.value = (step.value === "{{SECRET}}") ? await Vault.getSecret(step.selector) : step.value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            } catch (err) {
                console.error(`Failed to execute step: ${step.action} on ${step.selector}`, err);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        alert("Workflow Completed!");
    },
    waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }
};

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_AUTOMATION") AutomationEngine.run(msg.steps);
});