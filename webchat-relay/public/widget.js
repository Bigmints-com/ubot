/**
 * UBOT Webchat Widget
 * Embeddable chat widget for external websites.
 *
 * Usage:
 *   <script src="https://your-relay.run.app/widget.js"
 *           data-server="https://your-relay.run.app"></script>
 *
 * The widget talks to the cloud relay, which bridges to the local UBOT.
 */
(function () {
  "use strict";

  const script = document.currentScript;
  const BASE_URL = script?.getAttribute("data-server")
    || script?.src ? new URL(script.src).origin : window.location.origin;

  // ── State ───────────────────────────────────────────────

  let isOpen = false;
  let messages = [];
  let sessionId = "";
  let widgetConfig = {
    title: "Chat with us",
    color: "#6366f1",
    welcomeMessage: "Hi there! How can I help you today?",
  };
  let isLoading = false;

  // Session persistence
  const STORAGE_KEY = "ubot_webchat_session";
  try { sessionId = localStorage.getItem(STORAGE_KEY) || ""; } catch {}
  if (!sessionId) {
    sessionId = "wc_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    try { localStorage.setItem(STORAGE_KEY, sessionId); } catch {}
  }

  // ── Styles ──────────────────────────────────────────────

  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    #ubot-widget-root {
      --ubot-color: ${widgetConfig.color};
      --ubot-radius: 12px;
      --ubot-bg: #0a0a0a;
      --ubot-card: #141414;
      --ubot-border: #262626;
      --ubot-text: #fafafa;
      --ubot-muted: #a1a1aa;
      --ubot-input-bg: #1c1c1c;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      line-height: 1.5;
    }

    #ubot-widget-root * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .ubot-bubble {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--ubot-color);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 0 rgba(99,102,241,0.3);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
      animation: ubot-pulse 2s ease-in-out infinite;
    }

    @keyframes ubot-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 0 rgba(99,102,241,0.3); }
      50% { box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 8px rgba(99,102,241,0); }
    }

    .ubot-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.4); }

    .ubot-bubble svg { width: 24px; height: 24px; fill: white; transition: transform 0.3s ease; }
    .ubot-bubble.ubot-open svg { transform: rotate(90deg); }

    .ubot-panel {
      position: absolute;
      bottom: 72px;
      right: 0;
      width: 380px;
      max-height: 560px;
      background: var(--ubot-bg);
      border: 1px solid var(--ubot-border);
      border-radius: var(--ubot-radius);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
    }

    .ubot-panel.ubot-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    .ubot-header {
      padding: 16px 20px;
      background: linear-gradient(135deg, var(--ubot-color), color-mix(in srgb, var(--ubot-color) 80%, #000));
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .ubot-header-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
    .ubot-header-title { color: white; font-weight: 600; font-size: 14px; flex: 1; }
    .ubot-header-subtitle { color: rgba(255,255,255,0.7); font-size: 11px; }

    .ubot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 280px;
      max-height: 380px;
      scrollbar-width: thin;
      scrollbar-color: var(--ubot-border) transparent;
    }

    .ubot-messages::-webkit-scrollbar { width: 4px; }
    .ubot-messages::-webkit-scrollbar-thumb { background: var(--ubot-border); border-radius: 4px; }

    .ubot-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 13px;
      line-height: 1.5;
      word-wrap: break-word;
      animation: ubot-fadeIn 0.25s ease;
    }

    @keyframes ubot-fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ubot-msg-user { align-self: flex-end; background: var(--ubot-color); color: white; border-bottom-right-radius: 4px; }
    .ubot-msg-bot { align-self: flex-start; background: var(--ubot-card); color: var(--ubot-text); border: 1px solid var(--ubot-border); border-bottom-left-radius: 4px; }
    .ubot-msg-welcome { text-align: center; max-width: 100%; background: transparent; border: none; color: var(--ubot-muted); font-size: 12px; padding: 8px 0; align-self: center; }
    .ubot-msg-time { font-size: 10px; color: var(--ubot-muted); margin-top: 4px; opacity: 0.7; }
    .ubot-msg-user .ubot-msg-time { text-align: right; color: rgba(255,255,255,0.6); }

    .ubot-typing { display: flex; gap: 4px; padding: 12px 16px; align-self: flex-start; background: var(--ubot-card); border: 1px solid var(--ubot-border); border-radius: 16px; border-bottom-left-radius: 4px; }
    .ubot-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ubot-muted); animation: ubot-typing-bounce 1.4s ease-in-out infinite; }
    .ubot-typing-dot:nth-child(2) { animation-delay: 0.16s; }
    .ubot-typing-dot:nth-child(3) { animation-delay: 0.32s; }
    @keyframes ubot-typing-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }

    .ubot-input-area { padding: 12px 16px; border-top: 1px solid var(--ubot-border); display: flex; gap: 8px; flex-shrink: 0; background: var(--ubot-bg); }
    .ubot-input { flex: 1; background: var(--ubot-input-bg); border: 1px solid var(--ubot-border); border-radius: 8px; padding: 10px 14px; color: var(--ubot-text); font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.2s; resize: none; }
    .ubot-input:focus { border-color: var(--ubot-color); }
    .ubot-input::placeholder { color: var(--ubot-muted); }

    .ubot-send-btn { width: 40px; height: 40px; border-radius: 8px; background: var(--ubot-color); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s, transform 0.1s; flex-shrink: 0; }
    .ubot-send-btn:hover { opacity: 0.9; }
    .ubot-send-btn:active { transform: scale(0.95); }
    .ubot-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ubot-send-btn svg { width: 18px; height: 18px; fill: white; }

    .ubot-powered { text-align: center; padding: 6px; font-size: 10px; color: var(--ubot-muted); opacity: 0.6; border-top: 1px solid var(--ubot-border); }

    @media (max-width: 480px) {
      #ubot-widget-root { bottom: 12px; right: 12px; }
      .ubot-panel { width: calc(100vw - 24px); max-height: calc(100dvh - 100px); right: 0; bottom: 68px; }
    }
  `;

  const ICON_CHAT = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

  // ── API ─────────────────────────────────────────────────

  async function fetchConfig() {
    try {
      const r = await fetch(`${BASE_URL}/api/config`);
      if (r.ok) {
        const d = await r.json();
        widgetConfig.title = d.title || widgetConfig.title;
        widgetConfig.color = d.color || widgetConfig.color;
        widgetConfig.welcomeMessage = d.welcomeMessage || widgetConfig.welcomeMessage;
        const root = document.getElementById("ubot-widget-root");
        if (root) root.style.setProperty("--ubot-color", widgetConfig.color);
        const bubble = root?.querySelector(".ubot-bubble");
        if (bubble) bubble.style.background = widgetConfig.color;
        const title = root?.querySelector(".ubot-header-title");
        if (title) title.textContent = widgetConfig.title;
      }
    } catch {}
  }

  async function fetchHistory() {
    try {
      const r = await fetch(`${BASE_URL}/api/history?session=${sessionId}`);
      if (r.ok) {
        const d = await r.json();
        if (d.messages?.length) {
          messages = d.messages.map(m => ({
            role: m.role === "user" ? "user" : "bot",
            text: m.content,
            time: new Date(m.timestamp),
          }));
          renderMessages();
        }
      }
    } catch {}
  }

  async function sendMessage(text) {
    messages.push({ role: "user", text, time: new Date() });
    isLoading = true;
    renderMessages();

    try {
      const r = await fetch(`${BASE_URL}/api/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionId, message: text }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.response) messages.push({ role: "bot", text: d.response, time: new Date() });
      } else {
        messages.push({ role: "bot", text: "Sorry, something went wrong.", time: new Date() });
      }
    } catch {
      messages.push({ role: "bot", text: "Connection error. Please try again.", time: new Date() });
    }

    isLoading = false;
    renderMessages();
  }

  function escapeHtml(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
  function formatTime(d) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  function renderMessages() {
    const container = document.querySelector(".ubot-messages");
    if (!container) return;
    let html = "";
    if (messages.length === 0) html += `<div class="ubot-msg ubot-msg-welcome">${escapeHtml(widgetConfig.welcomeMessage)}</div>`;
    for (const msg of messages) {
      const cls = msg.role === "user" ? "ubot-msg-user" : "ubot-msg-bot";
      html += `<div class="ubot-msg ${cls}">${escapeHtml(msg.text)}<div class="ubot-msg-time">${formatTime(msg.time)}</div></div>`;
    }
    if (isLoading) html += `<div class="ubot-typing"><div class="ubot-typing-dot"></div><div class="ubot-typing-dot"></div><div class="ubot-typing-dot"></div></div>`;
    container.innerHTML = html;
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }

  // ── Mount ───────────────────────────────────────────────

  function mount() {
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "ubot-widget-root";
    root.innerHTML = `
      <div class="ubot-panel" id="ubot-panel">
        <div class="ubot-header">
          <div class="ubot-header-dot"></div>
          <div><div class="ubot-header-title">${escapeHtml(widgetConfig.title)}</div><div class="ubot-header-subtitle">Typically replies instantly</div></div>
        </div>
        <div class="ubot-messages"></div>
        <div class="ubot-input-area">
          <input class="ubot-input" placeholder="Type a message..." id="ubot-input" autocomplete="off" />
          <button class="ubot-send-btn" id="ubot-send">${ICON_SEND}</button>
        </div>
        <div class="ubot-powered">Powered by UBOT</div>
      </div>
      <button class="ubot-bubble" id="ubot-bubble">${ICON_CHAT}</button>
    `;
    document.body.appendChild(root);

    const bubble = document.getElementById("ubot-bubble");
    const panel = document.getElementById("ubot-panel");
    const input = document.getElementById("ubot-input");
    const sendBtn = document.getElementById("ubot-send");

    bubble.addEventListener("click", () => {
      isOpen = !isOpen;
      bubble.innerHTML = isOpen ? ICON_CLOSE : ICON_CHAT;
      bubble.classList.toggle("ubot-open", isOpen);
      panel.classList.toggle("ubot-visible", isOpen);
      if (isOpen) {
        fetchConfig();
        if (messages.length === 0) fetchHistory();
        renderMessages();
        setTimeout(() => input.focus(), 300);
      }
    });

    const handleSend = () => {
      const text = input.value.trim();
      if (!text || isLoading) return;
      input.value = "";
      sendMessage(text);
    };

    sendBtn.addEventListener("click", handleSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    renderMessages();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
