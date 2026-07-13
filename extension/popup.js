const dot = document.getElementById('statusDot');
const text = document.getElementById('statusText');
const tokenInput = document.getElementById('tokenInput');
const saveBtn = document.getElementById('saveToken');

chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response) => {
  if (response && response.connected) {
    dot.className = 'dot connected';
    text.innerHTML = '<strong>Connected</strong> to CipherVault';
  } else {
    dot.className = 'dot disconnected';
    text.innerHTML = '<strong>Not connected</strong>';
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
