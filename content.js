// Vibathon Playwright-Level DOM Automation Engine (v3.0)
// Fully working multi-step automation with cross-page navigation

if (window.__vibathon_injected) return;
window.__vibathon_injected = true;

let isRecording = false;
let eventDebounce = {};
let pendingTypeEvents = {};

const ENGINE_CONFIG = {
  MAX_WAIT_TIME: 10000,
  POLL_INTERVAL: 200,
  STEP_DELAY: 1200,
  TYPE_DELAY_MIN: 25,
  TYPE_DELAY_MAX: 55,
  SCORING: {
    ID_MATCH: 60,
    ARIA_LABEL: 45, TEXT_EXACT: 40, TEXT_PARTIAL: 25,
    NAME_ATTR: 35, PLACEHOLDER: 30, TITLE: 25,
    HREF: 35, ROLE: 20, CSS_PATH: 15, VISIBLE_PENALTY: -50
  }
};

const Telemetry = {
  log: (idx, msg, type = 'info') => {
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '🔎';
    console.log(`%c Vibathon [Step ${idx || '?'}] ${icon} ${msg}`, 'color: #6c63ff; font-weight: bold;');
  },
  warn: (msg) => console.warn(`Vibathon: ${msg}`),
  error: (msg, err) => console.error(`Vibathon Error: ${msg}`, err)
};

// ========== SELECTOR GENERATOR ==========
function generateSelectors(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
  const tagName = el.tagName.toLowerCase();
  const isDynamicId = (id) => !id || id.includes(':') || id.match(/\d{4,}/) || id.length > 20 || id.match(/^[a-z0-9]{8,}$/i);

  const selectors = {
    ariaLabel: el.getAttribute('aria-label') || '',
    role: el.getAttribute('role') || tagName,
    text: el.textContent?.trim().substring(0, 100) || '',
    partialText: el.textContent?.trim().substring(0, 20) || '',
    tagName: tagName,
    attributes: {},
    css: '',
    xpath: ''
  };

  const stableAttrs = ['name', 'placeholder', 'title', 'type', 'value', 'href', 'id', 'class', 'for', 'action'];
  for (const attr of el.attributes) {
    if (stableAttrs.includes(attr.name) || attr.name.startsWith('data-')) {
      selectors.attributes[attr.name] = attr.value;
    }
  }

  let cssPath = [];
  let curr = el;
  while (curr && curr.nodeType === Node.ELEMENT_NODE && cssPath.length < 5) {
    let segment = curr.tagName.toLowerCase();
    if (curr.id && !isDynamicId(curr.id)) {
      segment = '#' + CSS.escape(curr.id);
      cssPath.unshift(segment);
      break;
    } else {
      let idx = 1, sib = curr.previousElementSibling;
      while (sib) { if (sib.tagName === curr.tagName) idx++; sib = sib.previousElementSibling; }
      segment += `:nth-of-type(${idx})`;
    }
    cssPath.unshift(segment);
    curr = curr.parentElement;
  }
  selectors.css = cssPath.join(' > ');

  try {
    if (selectors.ariaLabel) {
      selectors.xpath = `//${tagName}[@aria-label="${selectors.ariaLabel.replace(/"/g, "'")}"]`;
    } else if (selectors.text && selectors.text.length < 50) {
      selectors.xpath = `//${tagName}[text()="${selectors.text.replace(/"/g, "'")}"]`;
    }
  } catch (e) {}

  return selectors;
}

// ========== SCORING ENGINE ==========
function getSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = s1.substring(0, 80); s2 = s2.substring(0, 80); // Cap for performance
  const longer = s1.length > s2.length ? s1 : s2;
  if (longer.length === 0) return 1.0;
  const tmp = [];
  for (let i = 0; i <= s1.length; i++) tmp[i] = [i];
  for (let j = 0; j <= s2.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      tmp[i][j] = Math.min(tmp[i-1][j]+1, tmp[i][j-1]+1, tmp[i-1][j-1]+(s1[i-1]===s2[j-1]?0:1));
    }
  }
  return (longer.length - tmp[s1.length][s2.length]) / longer.length;
}

function scoreElement(el, targetSelectors) {
  let score = 0;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  if (!isVisible) score += ENGINE_CONFIG.SCORING.VISIBLE_PENALTY;

  // ID match (very strong signal)
  const elId = el.id || '';
  const targetId = targetSelectors.attributes?.id || '';
  if (targetId && elId === targetId) score += ENGINE_CONFIG.SCORING.ID_MATCH;

  if (targetSelectors.ariaLabel && el.getAttribute('aria-label') === targetSelectors.ariaLabel) score += ENGINE_CONFIG.SCORING.ARIA_LABEL;

  // href match for links
  const elHref = el.getAttribute('href') || '';
  const targetHref = targetSelectors.attributes?.href || '';
  if (targetHref && elHref === targetHref) score += ENGINE_CONFIG.SCORING.HREF;

  const elText = el.textContent?.trim() || '';
  if (targetSelectors.text && elText === targetSelectors.text) score += ENGINE_CONFIG.SCORING.TEXT_EXACT;
  else if (targetSelectors.partialText && elText.includes(targetSelectors.partialText)) score += ENGINE_CONFIG.SCORING.TEXT_PARTIAL;
  else { const sim = getSimilarity(elText, targetSelectors.text); if (sim > 0.8) score += (sim * 20); }

  for (const [key, val] of Object.entries(targetSelectors.attributes || {})) {
    if (el.getAttribute(key) === val) {
      if (key === 'name') score += ENGINE_CONFIG.SCORING.NAME_ATTR;
      else if (key === 'placeholder') score += ENGINE_CONFIG.SCORING.PLACEHOLDER;
      else score += ENGINE_CONFIG.SCORING.TITLE;
    }
  }

  if (targetSelectors.role && (el.getAttribute('role') === targetSelectors.role || el.tagName.toLowerCase() === targetSelectors.role)) score += ENGINE_CONFIG.SCORING.ROLE;
  return score;
}

// ========== ELEMENT FINDER ==========
async function findBestElement(step, stepIdx) {
  const { selectors } = step;
  if (!selectors) return null;

  // Strategy 0: Direct ID match (strongest)
  if (selectors.attributes?.id) {
    try {
      const el = document.getElementById(selectors.attributes.id);
      if (el) { Telemetry.log(stepIdx, "ID match", "success"); return el; }
    } catch(e) {}
  }

  // Strategy 1: CSS
  try {
    const el = document.querySelector(selectors.css);
    if (el && scoreElement(el, selectors) > 25) {
      Telemetry.log(stepIdx, "CSS match", "success");
      return el;
    }
  } catch (e) {}

  // Strategy 2: XPath
  if (selectors.xpath) {
    try {
      const xr = document.evaluate(selectors.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      if (xr.singleNodeValue) { Telemetry.log(stepIdx, "XPath match", "success"); return xr.singleNodeValue; }
    } catch(e) {}
  }

  // Strategy 3: Attribute matching (name, placeholder, href, etc.)
  const attrPriority = ['name', 'placeholder', 'href', 'title', 'for', 'action'];
  for (const key of attrPriority) {
    const val = selectors.attributes?.[key];
    if (!val) continue;
    try {
      const el = document.querySelector(`[${key}="${CSS.escape(val)}"]`);
      if (el) { Telemetry.log(stepIdx, `Attribute [${key}] match`, "success"); return el; }
    } catch(e) {}
  }

  // Strategy 4: Heuristic scoring
  const tags = [selectors.tagName || step.metadata?.tagName || '*', 'button', 'a', 'input', 'textarea', 'select', 'div', 'span'];
  let candidates = [];
  for (const tag of [...new Set(tags)]) {
    try {
      const elements = Array.from(document.querySelectorAll(tag)).slice(0, 500);
      for (const el of elements) {
        const sc = scoreElement(el, selectors);
        if (sc > 15) candidates.push({ el, score: sc });
      }
    } catch(e) {}
    if (candidates.length > 30) break;
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 0 && candidates[0].score > 20) {
    Telemetry.log(stepIdx, `Heuristic match (score: ${candidates[0].score})`, "success");
    return candidates[0].el;
  }

  Telemetry.log(stepIdx, "All strategies failed.", "error");
  return null;
}

// ========== WAIT FOR ELEMENT ==========
async function waitForElement(step, stepIdx) {
  // Immediate check
  let el = await findBestElement(step, stepIdx);
  if (el) return el;

  // Poll with backoff
  return new Promise((resolve) => {
    let elapsed = 0;
    const interval = ENGINE_CONFIG.POLL_INTERVAL;
    const timer = setInterval(async () => {
      elapsed += interval;
      el = await findBestElement(step, stepIdx);
      if (el) { clearInterval(timer); resolve(el); return; }
      if (elapsed >= ENGINE_CONFIG.MAX_WAIT_TIME) { clearInterval(timer); resolve(null); }
    }, interval);
  });
}

// ========== MESSAGE LISTENER ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;
  switch (message.type) {
    case 'PING': sendResponse({ alive: true }); break;
    case 'START_RECORDING': isRecording = true; showIndicator('recording'); sendResponse({ success: true }); break;
    case 'STOP_RECORDING': isRecording = false; hideIndicator(); sendResponse({ success: true }); break;
    case 'START_AUTOMATION':
      chrome.storage.local.remove('vibathon_resume_steps', () => { runAutomation(message.steps); });
      sendResponse({ success: true });
      break;
  }
});

// ========== RESUME ON PAGE LOAD ==========
function attemptResume() {
  chrome.runtime.sendMessage({ type: 'GET_RECORDING' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.isRecording) { isRecording = true; showIndicator('recording'); }
  });
  chrome.storage.local.get('vibathon_resume_steps', (data) => {
    if (data.vibathon_resume_steps?.length > 0) {
      const steps = data.vibathon_resume_steps;
      chrome.storage.local.remove('vibathon_resume_steps', () => {
        Telemetry.log('R', `Resuming ${steps.length} remaining steps after navigation`);
        waitForPageReady().then(() => {
          // Decrypt any encrypted values before resuming
          decryptStepsIfNeeded(steps).then(decrypted => runAutomation(decrypted));
        });
      });
    }
  });
}

async function decryptStepsIfNeeded(steps) {
  const result = [];
  for (const step of steps) {
    if (step.encryptedValue) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'DECRYPT_VALUE', encrypted: step.encryptedValue });
        if (res?.success) {
          result.push({ ...step, value: res.value });
        } else {
          result.push(step);
        }
      } catch(e) {
        result.push(step);
      }
    } else {
      result.push(step);
    }
  }
  return result;
}

function waitForPageReady() {
  return new Promise((resolve) => {
    const checkReady = () => {
      if (document.readyState === 'complete') {
        // Wait extra for SPAs to render dynamic content
        setTimeout(resolve, 2000);
      } else {
        const handler = () => {
          window.removeEventListener('load', handler);
          setTimeout(resolve, 2000);
        };
        window.addEventListener('load', handler);
      }
    };
    // Check immediately or wait for DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkReady);
    } else {
      checkReady();
    }
    // Absolute fallback
    setTimeout(resolve, 8000);
  });
}

// Primary resume trigger
setTimeout(attemptResume, 1500);

// Secondary backup: listen for storage changes (covers race conditions)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.vibathon_resume_steps?.newValue?.length > 0) {
    // Another tab set steps for us to pick up - but only if this is the right page
    setTimeout(() => {
      chrome.storage.local.get('vibathon_resume_steps', (data) => {
        if (data.vibathon_resume_steps?.length > 0) {
          attemptResume();
        }
      });
    }, 2000);
  }
});

// ========== RECORDING LOGIC ==========
function recordEvent(action, el, extra = {}) {
  if (!isRecording || !el) return;
  const selectors = generateSelectors(el);
  const rect = el.getBoundingClientRect();
  const step = {
    action, selectors,
    metadata: {
      tagName: el.tagName.toLowerCase(),
      position: { x: Math.round(rect.left + rect.width/2), y: Math.round(rect.top + rect.height/2) },
      url: window.location.href,
      timestamp: Date.now()
    },
    ...extra
  };
  chrome.runtime.sendMessage({ type: 'RECORD_EVENT', event: step });
}

document.addEventListener('click', (e) => {
  if (!isRecording) return;
  // Try to find a meaningful interactive ancestor, but fall back to the clicked element itself
  let target = e.target.closest('button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], .btn, [onclick], [data-action], summary, label, li');
  if (!target) {
    // Fallback: use the actual clicked element if it's not just body/html/main container
    target = e.target;
    const tag = target.tagName?.toLowerCase();
    if (['html', 'body', 'main', 'section', 'article', 'header', 'footer', 'nav'].includes(tag)) return;
    // Skip very large containers (likely not the intended target)
    if (target.children?.length > 10) return;
  }
  if (target.tagName === 'A' && target.href?.startsWith('http')) {
    recordEvent('navigate', target, { url: target.href });
  } else {
    recordEvent('click', target);
  }
}, true);

document.addEventListener('input', (e) => {
  if (!isRecording) return;
  const target = e.target;
  if (target.tagName === 'SELECT') {
    recordEvent('select', target, { value: target.value });
    return;
  }
  const selectorKey = target.id || target.name || target.className || 'unknown';
  clearTimeout(eventDebounce[selectorKey]);
  // Detect if this is a password field
  const isSensitive = (target.type === 'password');
  pendingTypeEvents[selectorKey] = { target, value: target.value || target.textContent || '', isSensitive };
  eventDebounce[selectorKey] = setTimeout(() => {
    if (pendingTypeEvents[selectorKey]) {
      const extra = { value: pendingTypeEvents[selectorKey].value };
      if (pendingTypeEvents[selectorKey].isSensitive) extra.isSensitive = true;
      recordEvent('type', pendingTypeEvents[selectorKey].target, extra);
      delete pendingTypeEvents[selectorKey];
    }
  }, 500);
}, true);

document.addEventListener('change', (e) => {
  if (!isRecording) return;
  const target = e.target;
  if (target.type === 'checkbox') {
    recordEvent(target.checked ? 'check' : 'uncheck', target);
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (!isRecording || e.key !== 'Enter') return;
  const target = e.target;
  if (['input', 'textarea'].includes(target.tagName.toLowerCase()) || target.contentEditable === 'true') {
    const selectorKey = target.id || target.name || target.className || 'unknown';
    if (pendingTypeEvents[selectorKey]) {
      recordEvent('type', pendingTypeEvents[selectorKey].target, { value: pendingTypeEvents[selectorKey].value });
      clearTimeout(eventDebounce[selectorKey]);
      delete pendingTypeEvents[selectorKey];
    }
    recordEvent('press_enter', target);
  }
}, true);

// ========== AUTOMATION ENGINE ==========
async function runAutomation(steps) {
  if (!steps || steps.length === 0) return;
  showIndicator('automating');
  Telemetry.log('A', `Starting automation: ${steps.length} steps`);

  // Report progress
  function reportProgress(stepIdx, total, desc, status) {
    try {
      chrome.runtime.sendMessage({
        type: 'AUTOMATION_PROGRESS',
        stepIndex: stepIdx, totalSteps: total,
        description: desc, status: status
      });
    } catch(e) {}
  }

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepIdx = i + 1;
      const desc = step.description || `${step.action} step`;

      reportProgress(stepIdx, steps.length, desc, 'running');
      Telemetry.log(stepIdx, `Executing: ${step.action} — ${desc}`);

      // NAVIGATE: save remaining steps and change location
      if (step.action === 'navigate') {
        const url = step.url || step.metadata?.url;
        if (url) {
          reportProgress(stepIdx, steps.length, desc, 'navigating');
          const remaining = steps.slice(i + 1);
          if (remaining.length > 0) {
            await new Promise(r => chrome.storage.local.set({ vibathon_resume_steps: remaining }, r));
          }
          Telemetry.log(stepIdx, `Navigating to: ${url}`);
          window.location.href = url;
          return; // Script dies here, will resume via attemptResume
        }
      }

      // All other actions: find element and execute
      const success = await executeStep(step, stepIdx);
      if (success) {
        reportProgress(stepIdx, steps.length, desc, 'done');
        Telemetry.log(stepIdx, `Completed: ${desc}`, 'success');
      } else {
        reportProgress(stepIdx, steps.length, desc, 'failed');
        Telemetry.log(stepIdx, `Failed: ${desc}`, 'error');
      }

      // Wait between steps
      await new Promise(r => setTimeout(r, ENGINE_CONFIG.STEP_DELAY));
    }

    reportProgress(steps.length, steps.length, 'Automation complete', 'complete');
    Telemetry.log('✓', 'All steps completed!', 'success');
  } catch(err) {
    Telemetry.error('Automation crashed', err);
  } finally {
    hideIndicator();
  }
}

async function executeStep(step, stepIdx) {
  const el = await waitForElement(step, stepIdx);
  if (!el) {
    Telemetry.warn(`Step ${stepIdx}: Element not found, skipping`);
    return false;
  }

  highlightElement(el);
  await new Promise(r => setTimeout(r, 300));

  try {
    switch (step.action) {
      case 'click':
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await movePointerTo(el);
        await new Promise(r => setTimeout(r, 300));
        createClickRipple(el);
        // Try native click first, then simulated events
        await new Promise(r => setTimeout(r, 300));
        // Try native click first, then simulated events
        el.focus();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
        return true;

      case 'type':
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await movePointerTo(el);
        el.focus();
        const text = step.value || '';
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          // Clear field
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          // Type character by character
          for (let c = 0; c < text.length; c++) {
            el.value += text[c];
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('beforeinput', { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, ENGINE_CONFIG.TYPE_DELAY_MIN + Math.random() * (ENGINE_CONFIG.TYPE_DELAY_MAX - ENGINE_CONFIG.TYPE_DELAY_MIN)));
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.textContent = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;

      case 'press_enter':
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, code: 'Enter', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, code: 'Enter', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, code: 'Enter', bubbles: true }));
        // Also submit form if inside one
        const form = el.closest('form');
        if (form) { try { form.requestSubmit(); } catch(e) { form.submit(); } }
        return true;

      case 'select':
        el.value = step.value || '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;

      case 'check':
        if (!el.checked) el.click();
        return true;

      case 'uncheck':
        if (el.checked) el.click();
        return true;

      case 'scroll':
        window.scrollBy(0, step.value || 300);
        return true;

      default:
        Telemetry.warn(`Unknown action: ${step.action}`);
        return false;
    }
  } catch (err) {
    Telemetry.error(`Execution failed for ${step.action}`, err);
    return false;
  }
}

// ========== VISUAL UTILS ==========
function highlightElement(el) {
  const orig = el.style.outline;
  const origShadow = el.style.boxShadow;
  el.style.outline = '3px solid #6c63ff';
  el.style.boxShadow = '0 0 15px rgba(108, 99, 255, 0.5)';
  setTimeout(() => { el.style.outline = orig; el.style.boxShadow = origShadow; }, 1500);
}

function showIndicator(type) {
  hideIndicator();
  const div = document.createElement('div');
  div.id = 'vibathon-status-indicator';
  div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;padding:12px 24px;border-radius:30px;color:white;font-weight:bold;font-family:sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;transition:all 0.3s ease;';
  if (type === 'recording') {
    div.style.background = '#ff4757';
    div.innerHTML = '<span style="width:12px;height:12px;background:white;border-radius:50%;animation:vbpulse 1s infinite;"></span> Recording';
  } else {
    div.style.background = 'linear-gradient(135deg, #6c63ff, #a855f7)';
    div.innerHTML = '<span>🚀</span> Automating...';
  }
  const style = document.createElement('style');
  style.innerHTML = '@keyframes vbpulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }';
  document.head.appendChild(style);
  document.body.appendChild(div);
}

function hideIndicator() {
  document.getElementById('vibathon-status-indicator')?.remove();
}
} // end hideIndicator

// ========== VISUAL AUTOMATION INDICATORS ==========

let visualPointer = null;

function getVisualPointer() {
  if (visualPointer) return visualPointer;
  visualPointer = document.createElement('div');
  visualPointer.style.cssText = `
    position: fixed;
    width: 24px;
    height: 24px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236366f1' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z'/%3E%3C/svg%3E");
    background-size: contain;
    background-repeat: no-repeat;
    pointer-events: none;
    z-index: 2147483647;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    transition: top 0.5s cubic-bezier(0.25, 1, 0.5, 1), left 0.5s cubic-bezier(0.25, 1, 0.5, 1);
    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));
  `;
  document.body.appendChild(visualPointer);
  return visualPointer;
}

function movePointerTo(el) {
  return new Promise(resolve => {
    const pointer = getVisualPointer();
    const rect = el.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    
    pointer.style.left = `${targetX}px`;
    pointer.style.top = `${targetY}px`;
    
    setTimeout(resolve, 500); // match CSS transition duration
  });
}

function createClickRipple(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  const ripple = document.createElement('div');
  ripple.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 20px;
    height: 20px;
    background: rgba(99, 102, 241, 0.6);
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: none;
    z-index: 2147483646;
    animation: vibathon-ripple 0.6s ease-out forwards;
  `;
  document.body.appendChild(ripple);
  
  if (!document.getElementById('vibathon-ripple-style')) {
    const style = document.createElement('style');
    style.id = 'vibathon-ripple-style';
    style.textContent = `
      @keyframes vibathon-ripple {
        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  setTimeout(() => ripple.remove(), 600);
}