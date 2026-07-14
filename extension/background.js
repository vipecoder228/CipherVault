let ws = null;
let connected = false;
let reconnectDelay = 1000; // Start with 1 second
const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket('ws://127.0.0.1:19823');
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000; // Reset delay on successful connection
    chrome.storage.local.get(['authToken'], (result) => {
      if (result.authToken) {
        ws.send(JSON.stringify({ action: 'auth', token: result.authToken }));
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

    if (msg.action === 'auth-result') {
      connected = msg.ok;
      return;
    }

    // Forward to active tab's content script
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FROM_CONTENT') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg.payload));
    }
    return false;
  }

  if (msg.type === 'CHECK_STATUS') {
    sendResponse({ connected });
    return false;
  }

  if (msg.type === 'SET_TOKEN') {
    chrome.storage.local.set({ authToken: msg.token });
    reconnectDelay = 1000; // Reset delay when user manually connects
    connect();
    return false;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

connect();
