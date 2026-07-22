// CipherVault Extension — Background Service Worker
// Security: uses chrome.storage.session for auth token (cleared on browser close)

let ws = null;
let connected = false;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ─── Token Storage ─────────────────────────────────────
// chrome.storage.session is cleared when the browser closes,
// which is more secure than chrome.storage.local for auth tokens.

function saveToken(token) {
  return new Promise((resolve) => {
    chrome.storage.session.set({ authToken: token }, resolve);
  });
}

function loadToken() {
  return new Promise((resolve) => {
    chrome.storage.session.get(['authToken'], (result) => {
      resolve(result.authToken || null);
    });
  });
}

function clearToken() {
  return new Promise((resolve) => {
    chrome.storage.session.remove(['authToken'], resolve);
  });
}

// ─── WebSocket Connection ──────────────────────────────

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket('ws://127.0.0.1:19823');
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000;
    loadToken().then((token) => {
      if (token && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'auth', token }));
      }
    });
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // Validate message structure before processing
    if (!msg || typeof msg.action !== 'string') return;

    if (msg.action === 'auth-result') {
      connected = !!msg.ok;
      return;
    }

    // Forward only known actions to content script
    const ALLOWED_ACTIONS = ['search-result', 'entry-result', 'status', 'error'];
    if (!ALLOWED_ACTIONS.includes(msg.action)) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    });
  };

  ws.onclose = () => {
    connected = false;
    scheduleReconnect();
  };

  ws.onerror = () => {
    connected = false;
  };
}

function scheduleReconnect() {
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connect();
  }, reconnectDelay);
}

// ─── Message Handling ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Validate incoming message structure
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'FROM_CONTENT') {
    // Validate payload structure before forwarding to WebSocket
    const payload = msg.payload;
    if (!payload || typeof payload !== 'object' || typeof payload.action !== 'string') {
      return false;
    }

    // Only allow known actions to be sent to the app
    const ALLOWED_OUTGOING = ['search', 'get-entry', 'check-status'];
    if (!ALLOWED_OUTGOING.includes(payload.action)) return false;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
    return false;
  }

  if (msg.type === 'CHECK_STATUS') {
    sendResponse({ connected });
    return false;
  }

  if (msg.type === 'SET_TOKEN') {
    const token = msg.token;
    // Validate token format: 64 hex chars (32 bytes)
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      sendResponse({ ok: false, error: 'Invalid token format' });
      return false;
    }
    saveToken(token).then(() => {
      reconnectDelay = 1000;
      connect();
      sendResponse({ ok: true });
    });
    return true; // Keep message channel open for async response
  }

  return false;
});

// ─── Lifecycle ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

// Clean up on browser close / extension unload
chrome.runtime.onSuspend.addListener(() => {
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
});

connect();
