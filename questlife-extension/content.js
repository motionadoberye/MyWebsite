// ==========================================
// QuestLife Extension — content.js
// Injected into every page.
// On QuestLife pages: bridges postMessage ↔ chrome.runtime
// On all pages: listens for background messages and forwards to page
// ==========================================

(function () {
  'use strict';

  // ── Bridge: page → extension ──────────────────────────────────────
  // Listen for window.postMessage events from the QuestLife website and
  // relay them to the background service worker.

  const QUESTLIFE_OUTBOUND = new Set([
    'QUESTLIFE_START_TIMER',
    'QUESTLIFE_PAUSE_TIMER',
    'QUESTLIFE_RESUME_TIMER',
    'QUESTLIFE_STOP_TIMER',
    'QUESTLIFE_SYNC',
    'QUESTLIFE_BLOCK_ALL',
    'QUESTLIFE_NOTIFY',
    'QUESTLIFE_SET_REMINDERS',
    'QUESTLIFE_GET_TAB_TIME',
    'QUESTLIFE_RESET_TAB_TIME',
  ]);

  window.addEventListener('message', event => {
    // Only accept messages from the same window (the page itself)
    if (event.source !== window) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (!QUESTLIFE_OUTBOUND.has(event.data.type)) return;

    chrome.runtime.sendMessage(event.data, response => {
      if (chrome.runtime.lastError) return; // extension may be temporarily unavailable
      // Notify the page of the response
      window.postMessage({
        type:     `${event.data.type}_RESPONSE`,
        response: response || {},
        _from:    'questlife_extension',
      }, '*');
    });
  });

  // ── Bridge: extension → page ──────────────────────────────────────
  // Listen for messages from background.js and forward them to the page
  // via window.postMessage so the site's JS can react.

  chrome.runtime.onMessage.addListener((message, _sender) => {
    if (message._from !== 'background') return;
    // Relay to the page
    window.postMessage({ ...message, _from: 'questlife_extension' }, '*');
  });

  // ── Presence ping ─────────────────────────────────────────────────
  // When the page asks "is the extension installed?" reply immediately.
  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'QUESTLIFE_PING') return;
    window.postMessage({ type: 'QUESTLIFE_PONG', _from: 'questlife_extension' }, '*');
  });

  // Proactively announce presence so the site can detect the extension
  // without needing to send a ping first.
  window.postMessage({ type: 'QUESTLIFE_PONG', _from: 'questlife_extension' }, '*');
})();
