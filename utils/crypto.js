// crypto.js

/**
 * Simple AES-GCM encryption for sensitive inputs
 */
const CryptoManager = {
  // In a real app, you'd derive this from a user password.
  // For a hackathon, we'll generate/store a consistent key in memory.
  _key: null,

  async getKey() {
    if (this._key) return this._key;
    this._key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    return this._key;
  },

  /**
   * Encrypts a plain string
   */
  async encrypt(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.getKey();

    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );

    // Combine IV and Encrypted data for storage
    return {
      iv: Array.from(iv),
      content: Array.from(new Uint8Array(encrypted))
    };
  },

  /**
   * Decrypts back to plain string
   */
  async decrypt(encryptedObj) {
    const key = await this.getKey();
    const iv = new Uint8Array(encryptedObj.iv);
    const data = new Uint8Array(encryptedObj.content);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
};