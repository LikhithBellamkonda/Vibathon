# 🎯 Vibathon AI — Intelligent Browser Workflow Automation

## Problem Statement

Modern web users frequently perform repetitive tasks across multiple websites — filling forms, navigating between pages, clicking through multi-step processes, and entering credentials. These manual, time-consuming workflows are error-prone and wasteful. Existing browser automation tools are either too technical (requiring code) or too fragile (breaking when websites change).

**Vibathon AI** solves this by providing a no-code, AI-powered browser workflow automation system that learns from your actions, builds self-healing automations, and replays them reliably — even across page navigations and dynamic websites. It features military-grade AES-256 encryption for sensitive data and biometric face verification for password-protected workflows.

---

## ✨ Features

### 🎯 Core Automation
- **One-Click Recording** — Start recording your browser actions with a single click. Vibathon captures clicks, typing, navigation, form selections, checkboxes, and keyboard actions automatically.
- **Multi-Step Cross-Page Automation** — Workflows that span multiple pages work seamlessly. The engine saves remaining steps before navigation and resumes automatically after page load.
- **Self-Healing Selector Engine** — Uses 5 strategies (ID, CSS, XPath, attribute matching, heuristic scoring) to find elements even when websites change their structure. Works on complex sites like Wikipedia.
- **AI-Powered Analysis** — Powered by Google Gemini AI, the system analyzes your recorded workflow and provides a human-readable summary, flowchart, and reasoning about each step.

### 🔀 Visual Flowchart Editor
- **Drag-and-Drop Visual Flowchart** — Recorded workflows are displayed as beautiful, editable flow nodes (not code). Each step is a card connected by visual arrows.
- **Inline Editing** — Click on any step to edit its description, target selector, typed value, or URL directly in the flowchart.
- **Reorder Steps** — Drag nodes to reorder, or use up/down arrows.
- **Add/Delete Steps** — Insert new steps between existing ones with the "+" button, or delete any step.
- **No Raw Links** — Navigate steps show friendly website names (e.g., "Opens google.com") instead of raw URLs.

### 📚 Workflow Library
- **Save Workflows** — Save any recorded/edited workflow to your personal library for reuse.
- **Edit Previous Workflows** — Load any saved workflow back into the visual editor, modify it, and save changes or re-execute.
- **One-Click Replay** — Run any saved workflow directly from the library.

### 🔐 Security & Encryption
- **AES-256-GCM Encryption** — All sensitive data (passwords, credentials) recorded during workflows is encrypted using the Web Crypto API with AES-256-GCM. Encryption keys are auto-generated and stored securely.
- **Encrypted Vault** — Passwords are never stored in plaintext. The Vault module provides one-time encryption that can be reused whenever workflows are replayed.
- **Video-Based Face Recognition** — Enroll your face via webcam in Settings. When running any workflow that contains password fields, the system requires live face verification before execution.
- **Perceptual Hashing** — Face verification uses a perceptual hash algorithm with Hamming distance comparison for fast, offline biometric matching.

### 🧠 AI Intelligence
- **AI Thinking Panel** — See the AI's reasoning about what each step does and why, displayed in a dedicated "AI Thinking" panel.
- **Smart Summaries** — Get one-line summaries of complex workflows.
- **Auto-Generated Flowcharts** — AI creates readable flowcharts from raw recorded actions.

### 🚀 Robust Execution
- **Auto Tab Opening** — Automation automatically opens the correct website tab if it's not already open — no manual setup required.
- **Progress Tracking** — Real-time progress bar showing which step is executing and completion percentage.
- **Content Script Injection** — Automatically injects the automation engine into any page, even if the extension was just installed.
- **Service Worker Keep-Alive** — Background service worker stays active during long automations using Chrome Alarms API.

---

## 🛠️ Installation Instructions

### Prerequisites
- **Google Chrome** browser (version 88 or later)
- A **Google Gemini API key** (free tier available at [Google AI Studio](https://aistudio.google.com/apikey))

### Step-by-Step Setup

1. **Download/Clone the Repository**
   ```
   git clone https://github.com/your-repo/Vibathon-main.git
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/` in your browser
   - Enable **Developer mode** (toggle in the top right corner)

3. **Load the Extension**
   - Click **"Load unpacked"**
   - Select the `Vibathon-main` folder
   - The Vibathon icon will appear in your Chrome toolbar

4. **Configure API Key**
   - Click the Vibathon icon → **Dashboard**
   - Go to **Settings** in the sidebar
   - Enter your Gemini API key and click **Save API Key**
   - Click **Test Connection** to verify

5. **Enroll Face (Optional but Recommended)**
   - In **Settings**, scroll to **Face Recognition Lock**
   - Click **Enroll Face** → Allow camera access → Click **Capture**
   - This protects any workflow containing passwords

---

## 📖 How to Use

### Recording a Workflow
1. Click the Vibathon extension icon
2. Click **"Start Recording"**
3. Perform your desired actions on any website (click, type, navigate, etc.)
4. Click the extension icon again → **"Stop & Analyze"**
5. View your workflow in the visual flowchart editor

### Editing a Workflow
- Edit step descriptions, selectors, and values directly in the flowchart
- Drag steps to reorder them
- Click **"+"** buttons to add new steps
- Click **"✕"** to delete steps

### Running Automation
1. After recording/editing, click **"🚀 Run Automation"**
2. The extension will automatically:
   - Open the correct website (if not already open)
   - Execute each step with visual highlighting
   - Navigate between pages seamlessly
   - Show progress in real-time

### Saving & Reusing
1. Enter a workflow name and click **"💾 Save"**
2. Go to **Workflow Library** to see all saved workflows
3. Click **"✏️ Edit"** to modify a saved workflow
4. Click **"🚀 Run"** to replay any saved workflow

---

## 📁 Project Structure

```
Vibathon-main/
├── manifest.json       # Chrome Extension manifest (MV3)
├── background.js       # Service worker: AI analysis, automation orchestration, encryption vault
├── content.js          # Content script: DOM recording, element finding, step execution
├── popup.html          # Extension popup UI
├── popup.js            # Popup controller
├── recorder.html       # Full dashboard UI with visual flowchart & settings
├── recorder.js         # Dashboard controller: flowchart, history, face recognition
├── vault.js            # AES-256-GCM encryption module
├── config.js           # API configuration
├── executor.js         # Legacy execution engine
├── utils/
│   ├── ai.js           # AI communication helper
│   ├── crypto.js        # Crypto utilities
│   ├── player.js       # Workflow player utility
│   └── recorder.js     # Recording utility
└── README.md           # This file
```

---

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────┐
│              Vibathon Security               │
├─────────────────────────────────────────────┤
│  Layer 1: AES-256-GCM Encryption            │
│  • Auto-generated 256-bit key               │
│  • Unique IV per encryption                 │
│  • Passwords never stored in plaintext      │
├─────────────────────────────────────────────┤
│  Layer 2: Face Recognition Gate             │
│  • Webcam-based face enrollment             │
│  • Perceptual hash comparison               │
│  • Required for password workflows          │
├─────────────────────────────────────────────┤
│  Layer 3: Chrome Extension Sandbox          │
│  • Isolated content scripts                 │
│  • Secure chrome.storage.local              │
│  • No external data transmission            │
└─────────────────────────────────────────────┘
```

---

## 🧪 Tech Stack

| Component | Technology |
|-----------|-----------|
| Platform | Chrome Extension (Manifest V3) |
| AI Engine | Google Gemini API (2.5 Flash / 2.0 Flash / 2.5 Pro) |
| Encryption | Web Crypto API (AES-256-GCM) |
| Face Recognition | MediaDevices API + Perceptual Hashing |
| UI Framework | Vanilla JS + CSS (no dependencies) |
| Typography | Google Fonts (Outfit, JetBrains Mono) |
| Storage | Chrome Storage API (local) |

---

## ⚠️ Known Limitations

- Face recognition uses perceptual hashing (not deep learning) — works best in consistent lighting
- Some websites with strict Content Security Policies may block content script injection
- Automation speed is throttled to simulate natural human interaction
- Workflows with CAPTCHA or 2FA steps require manual intervention during those steps

---

## 📄 License

MIT License — Free for personal and commercial use.

---

**Built with ❤️ for everyone**
