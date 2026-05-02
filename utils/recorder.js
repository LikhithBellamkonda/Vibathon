// utils/recorder.js
let recordedSteps = [];

function handleCapture(event) {
  // 1. Log immediately to see if the click even registers
  console.log("Recorder triggered by event:", event.type);

  const element = event.target;
  const selector = getSelector(element);
  
  const step = {
    action: event.type === 'click' ? 'click' : 'type',
    selector: selector,
    value: (event.type === 'input') ? element.value : '',
    timestamp: Date.now()
  };

  // 2. Add to array
  recordedSteps.push(step);
  
  // 3. Confirm the array is growing
  console.log("Step added! Current count:", recordedSteps.length);
  console.log("Current Step Data:", step);
}

function getSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
  
  // Tag + Class fallback
  let sel = el.tagName.toLowerCase();
  if (el.classList.length > 0) {
    sel += `.${Array.from(el.classList).join('.')}`;
  }
  return sel;
}

function getRecordedSteps() {
  console.log("Final steps being sent to popup:", recordedSteps);
  const data = [...recordedSteps];
  recordedSteps = []; // Reset for next time
  return data;
}