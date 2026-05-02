# Vibathon AI — Secure Browser Automation Engine 🚀

Vibathon is a powerful, secure, and AI-driven Chrome Extension for recording, editing, and executing browser automation workflows. It transforms manual repetitive tasks into automated Playwright-style execution flows with advanced visual indicators and end-to-end security.

## ✨ Key Features

- **🧠 AI Workflow Analysis**: Uses Gemini AI to understand recorded interactions, generate summaries, and explain each step in plain English.
- **🔐 Enterprise-Grade Security**: 
  - Passwords and sensitive inputs are encrypted using AES-256-GCM before storage.
  - No hardcoded API keys. Keys are stored locally via a dedicated `options` page.
  - Biometric face verification for sensitive workflows using Perceptual Hashing.
- **🎥 Visual Automation**:
  - Live cursor tracking during playback.
  - Interactive click ripple effects.
  - Simulated typing indicators.
- **🛡️ Robust Execution Engine**:
  - Auto-waits for elements (like Playwright).
  - Handles cross-page navigation.
  - Isolated content script injection with guards.
- **🎨 Beautiful UI**:
  - Glassmorphism dashboards and flowcharts.
  - Dark mode by default with animated indicators.

## 🛠️ Setup Instructions

1. Clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** and select the `Vibathon-main` directory.
5. Right-click the Vibathon extension icon and go to **Options** (or Settings).
6. Enter your Gemini API Key and save.

## 🚀 Usage

1. Click the Vibathon extension icon to open the popup.
2. Click **Start Recording** and perform your actions on any webpage.
3. When finished, open the popup and click **Stop Recording**.
4. The AI will analyze the workflow and open the Dashboard automatically.
5. Review the visual flowchart, edit actions, and click **Save Workflow**.
6. Go to the **Workflow Library** to replay or manage saved workflows.

## 🏗️ Architecture

- **Manifest V3**: Fully compliant with Chrome's MV3 standard. Uses Service Workers and strict permissions.
- **Encrypted Vault**: All secrets (like entered passwords) use `crypto.subtle` with dynamic initialization vectors (IV).
- **Session State**: Uses `chrome.storage.session` for rapid, secure, and ephemeral state tracking during recording.

---
Built by [Likhith Bellamkonda](https://github.com/likhithbellamkonda)
