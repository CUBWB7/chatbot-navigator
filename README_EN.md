# Chatbot Navigator

[中文](README.md)

> A right-side timeline bar for ChatGPT / Claude / Gemini — quickly jump to any message in long conversations.


![Main Screenshot](pics/chatgpt.png)

---

## Features

- **Visual Timeline** — Small blocks fixed on the right side of the page, each representing a user message
- **One-Click Navigation** — Click any block to smooth-scroll to that message
- **Hover Preview** — Hover over a block to see a text preview with smart truncation (CJK-friendly)
- **Attachment Detection** — 📎 file messages and 🖼 image messages are automatically labeled
- **Real-Time Updates** — Timeline refreshes automatically when new messages are sent
- **SPA-Aware** — Timeline rebuilds when switching conversations, no manual refresh needed
- **Multi-Platform** — One script, three platforms, toggle each via Tampermonkey menu

## Attachment Detection Logic

Timeline labels automatically add prefix icons based on message content:

| Message Content | Label Display | Example |
|-----------------|--------------|---------|
| Text only | Truncated text | `I'd like to know...` |
| Text + File | 📎\| Text | `📎\| Please analyze...` |
| Text + Image | 🖼\| Text | `🖼\| This image shows...` |
| Text + File + Image | 📎\| Text | `📎\| Please analyze...` |
| File only (no text) | 📎 Filename | `📎 report.pdf` |
| Image only (no text) | 🖼 | `🖼` |
| No content | Index number | `#3` |

> Priority: file > image. When a message contains both text and attachments, the icon is shown as a prefix before the text preview.

## Demo

![Demo](pics/chatgpt-example.gif)

## Supported Platforms

| Platform | Default |
|----------|---------|
| ChatGPT (`chatgpt.com`) | ✅ Enabled |
| Claude (`claude.ai`) | ✅ Enabled |
| Gemini (`gemini.google.com`) | ✅ Enabled |

---

## Usage

1. Open any conversation page on ChatGPT / Claude / Gemini
2. A timeline bar will automatically appear on the right side
3. **Click a block** → jump to that message
4. **Hover a block** → see the message preview

### Custom Toggles

Toggle each platform and the "Keep Expanded" option via the Tampermonkey extension menu:

> Tampermonkey icon → Script menu → Click an option to toggle ✅ / ❌

![Tampermonkey Menu](pics/tampermonkey.png)

Settings are saved automatically and take effect after page refresh.


---

## Installation

### Prerequisites

Install one of the following userscript manager browser extensions:

- [Tampermonkey](https://www.tampermonkey.net/) (recommended)
- [Violentmonkey](https://violentmonkey.github.io/)

### Option 1: Install from Greasy Fork (Recommended)

<!-- Replace the link below with your actual Greasy Fork URL after uploading -->
1. Visit the [Greasy Fork script page](YOUR_GREASY_FORK_URL)
2. Click **Install this script**
3. Confirm the installation in the popup

### Option 2: Install from GitHub

1. Open [chatgpt-timeline.user.js](https://github.com/CUBWB7/chatbot-navigator/raw/main/chatgpt-timeline.user.js)
2. Tampermonkey will automatically detect the script and show the install page
3. Click **Install**


---

## License

[MIT License](LICENSE)

## More Powerful Alternatives

- [gemini-voyager](https://github.com/nicq000/gemini-voyager)
- [chatgpt-conversation-timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)
- [claude-nexus](https://github.com/Qiuner/claude-nexus)
