// player.js

/**
 * Replays a sequence of recorded steps
 * @param {Array} steps - The array of workflow steps
 */
async function playWorkflow(data) {
  console.log("Workflow Player: Starting...");
  
  // Extract steps whether 'data' is an array or an object {steps: []}
  const steps = Array.isArray(data) ? data : (data.steps || []);

  if (steps.length === 0) {
    console.warn("No steps found to play.");
    return;
  }

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, 800)); // Slower for stability
    const element = document.querySelector(step.selector);

    if (element) {
      highlightElement(element);
      if (step.action === 'click') {
        element.click();
      } else if (step.action === 'type') {
        element.value = step.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      console.log(`Executed: ${step.action} on ${step.selector}`);
    } else {
      console.warn(`Could not find: ${step.selector}`);
    }
  }
  console.log("Workflow Player: Finished.");
}

/**
 * Visual feedback: briefly highlight the element being acted upon
 */
function highlightElement(el) {
  const originalOutline = el.style.outline;
  el.style.outline = "3px solid #4CAF50";
  setTimeout(() => {
    el.style.outline = originalOutline;
  }, 400);
}