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

saveBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim();
  if (!token) return;

  chrome.runtime.sendMessage({ type: 'SET_TOKEN', token });
  saveBtn.textContent = 'Saved!';
  setTimeout(() => {
    saveBtn.textContent = 'Connect';
  }, 1500);
});
