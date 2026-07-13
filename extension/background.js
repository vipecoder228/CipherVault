let ws = null;
let connected = false;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket('ws://127.0.0.1:19823');
  } catch {
    return;
  }

  ws.onopen = () => {
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
    setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    connected = false;
  };
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
    connect();
    return false;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

connect();
