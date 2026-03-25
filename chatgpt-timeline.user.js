// ==UserScript==
// @name         ChatGPT Timeline Navigator
// @namespace    https://github.com/bwb/chatgpt-timeline
// @version      0.4.5
// @description  Adds a right-side timeline for navigating long ChatGPT conversations
// @author       bwb
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Region 2: CSS ────────────────────────────────────────────────────────

  GM_addStyle(`
    #cgpt-timeline {
      position: fixed;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 14px;
      padding: 8px 4px;
      max-height: 80vh;
      overflow-y: auto;
      scrollbar-width: none;
    }

    #cgpt-timeline::-webkit-scrollbar {
      display: none;
    }

    .cgpt-tl-node {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      flex-shrink: 0;
    }

    .cgpt-tl-label {
      font-size: 13px;
      color: #555;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
      max-width: 0;
      opacity: 0;
      transition: max-width 150ms ease-out, opacity 150ms ease-out;
    }

    #cgpt-timeline:hover .cgpt-tl-label {
      max-width: 220px;
      opacity: 1;
    }

    .cgpt-tl-block {
      width: 30px;
      height: 6px;
      border-radius: 2px;
      background: #ccc;
      flex-shrink: 0;
      transition: background 150ms ease-out;
    }

    .cgpt-tl-block.active {
      background: #333;
    }

    .cgpt-tl-node:hover .cgpt-tl-block {
      background: #888;
    }
  `);

  // ─── Region 3: DOM Utility Functions ──────────────────────────────────────

  function findUserMessages() {
    const selectors = [
      '[data-message-author-role="user"]',
      '[data-testid^="conversation-turn-"][data-testid*="user"]',
      '.group\\/conversation-turn:has([data-message-author-role="user"])',
    ];

    for (const sel of selectors) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length > 0) return els;
      } catch (_) {
        // selector not supported, try next
      }
    }

    return [];
  }

  function findScrollContainer(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const overflow = style.overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return node;
      node = node.parentElement;
    }
    return window;
  }

  function smartTruncate(text) {
    const MAX_PX = 220;
    const SUFFIX = '…';

    // Reuse a single canvas context for measurement
    if (!smartTruncate._ctx) {
      const canvas = document.createElement('canvas');
      smartTruncate._ctx = canvas.getContext('2d') || null;
      if (smartTruncate._ctx) smartTruncate._ctx.font = '13px sans-serif';
    }
    const ctx = smartTruncate._ctx;
    if (!ctx) {
      // Canvas unavailable (privacy-hardened browser) — fall back to char count
      const MAX_CHARS = 30;
      return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + SUFFIX : text;
    }

    // Text fits — return as-is
    if (ctx.measureText(text).width <= MAX_PX) return text;

    // Find the last punctuation break that still fits within MAX_PX
    const puncts = /[？，：。,.?:]/;
    let bestBreak = -1;
    for (let i = 0; i < text.length; i++) {
      if (puncts.test(text[i])) {
        const candidate = text.slice(0, i + 1) + SUFFIX;
        if (ctx.measureText(candidate).width <= MAX_PX) {
          bestBreak = i + 1;
        } else if (bestBreak >= 0) {
          break;
        }
      }
    }
    if (bestBreak > 0) return text.slice(0, bestBreak) + SUFFIX;

    // No punctuation — hard-truncate at pixel boundary
    let end = text.length;
    while (end > 0 && ctx.measureText(text.slice(0, end) + SUFFIX).width > MAX_PX) {
      end--;
    }
    return (end > 0 ? text.slice(0, end) : '') + SUFFIX;
  }

  function getMessagePreview(el, index) {
    const textEl = el.querySelector('.whitespace-pre-wrap');
    const text = textEl ? textEl.textContent.trim().replace(/\s+/g, ' ') : '';
    const fileBtn = el.querySelector('button[class*="interactive-bg-secondary"][aria-label]');
    const hasImage = !!el.querySelector('[class*="message-image"]');

    if (text && fileBtn)  return '📎| ' + smartTruncate(text);
    if (text && hasImage) return '🖼| ' + smartTruncate(text);
    if (text)             return smartTruncate(text);
    if (fileBtn)          return '📎 ' + smartTruncate(fileBtn.getAttribute('aria-label'));
    if (hasImage)         return '🖼';
    return `#${index + 1}`;
  }

  function isConversationPage() {
    return /\/c\//.test(location.pathname);
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('waitForElement timed out'));
      }, timeout);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // ─── Region 4: TimelineManager ────────────────────────────────────────────

  const MAX_NODES = 200;

  class TimelineManager {
    constructor() {
      this.container = null;
      this.nodes = [];
      this.activeNodeIndex = -1;
      this.scrollContainer = null;

      this._mutationObserver = null;
      this._resizeObserver = null;
      this._scrollTarget = null;
      this._onScroll = null;
      this._rafId = null;
      this._debounceTimer = null;
    }

    init() {
      let messages = findUserMessages();
      if (messages.length === 0) {
        console.warn('[ChatGPT Timeline] No user messages found. Selector may need updating.');
        return;
      }
      if (messages.length > MAX_NODES) {
        console.warn(`[ChatGPT Timeline] ${messages.length} messages found, showing first ${MAX_NODES}.`);
        messages = messages.slice(0, MAX_NODES);
      }

      this.scrollContainer = findScrollContainer(messages[0]);
      this.buildNodes(messages);
      this.createUI();
      this.setupScrollListener();
      this.setupMutationObserver();
      this.updatePosition();
      this.setupResizeObserver();
    }

    buildNodes(messages) {
      this.nodes = messages.map((el, i) => ({
        id: i,
        element: el,
        preview: getMessagePreview(el, i),
      }));
    }

    createUI() {
      if (this.container) {
        this.container.remove();
        this.container = null;
      }

      const container = document.createElement('div');
      container.id = 'cgpt-timeline';

      this.nodes.forEach((node, i) => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'cgpt-tl-node';
        nodeEl.dataset.index = i;

        const label = document.createElement('span');
        label.className = 'cgpt-tl-label';
        label.textContent = node.preview;

        const block = document.createElement('div');
        block.className = 'cgpt-tl-block';

        nodeEl.appendChild(label);
        nodeEl.appendChild(block);
        nodeEl.addEventListener('click', () => this.scrollToNode(i));
        container.appendChild(nodeEl);
      });

      document.body.appendChild(container);
      this.container = container;
      this.renderTimeline();
    }

    renderTimeline() {
      if (!this.container) return;

      const nodeEls = this.container.querySelectorAll('.cgpt-tl-node');
      nodeEls.forEach((nodeEl, i) => {
        const block = nodeEl.querySelector('.cgpt-tl-block');
        nodeEl.style.display = 'flex';
        if (i === this.activeNodeIndex) {
          block.classList.add('active');
        } else {
          block.classList.remove('active');
        }
      });
    }

    setupScrollListener() {
      this.updateActiveNode();

      this._onScroll = () => {
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
          this._rafId = null;
          this.updateActiveNode();
          this.renderTimeline();
        });
      };

      this._scrollTarget = this.scrollContainer === window ? window : this.scrollContainer;
      this._scrollTarget.addEventListener('scroll', this._onScroll, { passive: true });
    }

    updateActiveNode() {
      const threshold = window.innerHeight / 3;
      let bestIndex = -1;
      let bestDist = Infinity;

      this.nodes.forEach((node, i) => {
        const rect = node.element.getBoundingClientRect();
        if (rect.top <= threshold) {
          const dist = threshold - rect.top;
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
          }
        }
      });

      this.activeNodeIndex = bestIndex;
    }

    scrollToNode(index) {
      const node = this.nodes[index];
      if (!node) return;
      node.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setupMutationObserver() {
      this._mutationObserver = new MutationObserver(() => {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          const messages = findUserMessages();
          if (messages.length !== this.nodes.length) {
            this.buildNodes(messages.slice(0, MAX_NODES));
            this.createUI();
            this.updateActiveNode();
            this.renderTimeline();
          }
        }, 300);
      });

      const target = this.scrollContainer === window ? document.body : this.scrollContainer;
      this._mutationObserver.observe(target, { childList: true, subtree: true });
    }

    updatePosition() {
      if (!this.container) return;

      const contentSelectors = ['main', '[class*="react-scroll-to-bottom"]', '#__next main'];
      let contentEl = null;
      for (const sel of contentSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el) { contentEl = el; break; }
        } catch (_) {}
      }

      if (contentEl) {
        const rect = contentEl.getBoundingClientRect();
        const available = window.innerWidth - rect.right;
        if (available >= 44) {
          this.container.style.right = Math.round(available / 2 - 15) + 'px';
          return;
        }
      }

      this.container.style.right = '12px';
    }

    setupResizeObserver() {
      this._resizeObserver = new ResizeObserver(() => this.updatePosition());
      this._resizeObserver.observe(document.documentElement);
    }

    destroy() {
      if (this.container) { this.container.remove(); this.container = null; }
      if (this._mutationObserver) { this._mutationObserver.disconnect(); this._mutationObserver = null; }
      if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
      if (this._scrollTarget && this._onScroll) {
        this._scrollTarget.removeEventListener('scroll', this._onScroll);
      }
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
      clearTimeout(this._debounceTimer);
      this.nodes = [];
    }
  }

  // ─── Region 5: Entry Point + SPA Routing ─────────────────────────────────

  let manager = null;
  let startToken = 0;

  function startTimeline() {
    if (manager) { manager.destroy(); manager = null; }

    if (!isConversationPage()) return;

    const token = ++startToken;
    waitForElement('[data-message-author-role="user"]', 8000)
      .then(() => {
        if (token !== startToken) return;
        manager = new TimelineManager();
        manager.init();
      })
      .catch(() => {
        console.warn('[ChatGPT Timeline] Timed out waiting for user messages.');
      });
  }

  function patchHistory(method) {
    if (history[method]._cgptPatched) return;
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('cgpt-url-change'));
      return result;
    };
    history[method]._cgptPatched = true;
  }

  patchHistory('pushState');
  patchHistory('replaceState');
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('cgpt-url-change')));
  window.addEventListener('cgpt-url-change', startTimeline);

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      window.dispatchEvent(new Event('cgpt-url-change'));
    }
  }, 1000);

  startTimeline();
})();
