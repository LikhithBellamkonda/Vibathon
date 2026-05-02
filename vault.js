// Vibathon Encrypted Vault v3.0
// Uses AES-256-GCM via Web Crypto API for secure password storage
// This module is available for direct import in content scripts

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