/**
 * ai.js - Utility to communicate with the background script's AI logic
 */
const AIHelper = {
  /**
   * Sends raw steps to the background script to be processed by Gemini
   * @param {Array} rawSteps - The array of captured browser actions
   * @returns {Promise<Object>} - The structured JSON workflow
   */
  async structureWorkflow(rawSteps) {
    console.log("AIHelper: Requesting workflow structuring...");
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          action: "PROCESS_WITH_AI", 
          steps: rawSteps 
        }, 
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          
          if (response && response.success) {
            console.log("AIHelper: Successfully structured workflow.");
            resolve(response.data);
          } else {
            reject(new Error(response?.error || "AI processing failed"));
          }
        }
      );
    });
  },

  /**
   * Local Fallback: Basic structuring if API is unavailable
   */
  formatLocal(rawSteps) {
    return {
      name: `Manual Workflow ${new Date().toLocaleTimeString()}`,
      steps: rawSteps.map(s => ({
        action: s.action,
        selector: s.selector,
        value: s.value || null
      }))
    };
  }
};