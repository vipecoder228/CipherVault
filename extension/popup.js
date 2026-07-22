const dot = document.getElementById('statusDot');
const text = document.getElementById('statusText');
const tokenInput = document.getElementById('tokenInput');
const saveBtn = document.getElementById('saveToken');

chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response) => {
  if (response && response.connected) {
    dot.className = 'dot connected';
    text.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Connected';
    text.appendChild(strong);
    text.appendChild(document.createTextNode(' to CipherVault'));
  } else {
    dot.className = 'dot disconnected';
    text.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Not connected';
    text.appendChild(strong);
  }
});

// Validate token format: 64 hex chars (32 bytes)
function isValidTokenFormat(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

saveBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim().toLowerCase();
  if (!token) return;

  if (!isValidTokenFormat(token)) {
    saveBtn.textContent = 'Invalid format';
    saveBtn.style.background = '#ef4444';
    setTimeout(() => {
      saveBtn.textContent = 'Connect';
      saveBtn.style.background = '';
    }, 2000);
    return;
  }

  chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, (response) => {
    if (response && response.ok) {
      saveBtn.textContent = 'Saved!';
      saveBtn.style.background = '#22c55e';
      setTimeout(() => {
        saveBtn.textContent = 'Connect';
        saveBtn.style.background = '';
      }, 1500);
    } else {
      saveBtn.textContent = 'Error';
      saveBtn.style.background = '#ef4444';
      setTimeout(() => {
        saveBtn.textContent = 'Connect';
        saveBtn.style.background = '';
      }, 2000);
    }
  });
});

// Clear input after paste for security
tokenInput.addEventListener('paste', () => {
  setTimeout(() => {
    // Auto-validate after paste
    const token = tokenInput.value.trim().toLowerCase();
    if (token && isValidTokenFormat(token)) {
      saveBtn.style.background = '#22c55e';
      saveBtn.textContent = 'Valid — Click to save';
    } else if (token) {
      saveBtn.style.background = '#ef4444';
      saveBtn.textContent = 'Invalid format';
    }
  }, 100);
});

tokenInput.addEventListener('input', () => {
  saveBtn.textContent = 'Connect';
  saveBtn.style.background = '';
});
