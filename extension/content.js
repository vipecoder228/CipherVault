(() => {
  const CV_ICON_CLASS = 'ciphervault-autofill';
  let currentIcons = [];

  function findUsernameField(pwdField, container) {
    const candidates = container.querySelectorAll(
      'input[type="email"], input[type="text"], input[type="tel"], input:not([type])'
    );

    for (const input of candidates) {
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const autocomplete = (input.autocomplete || '').toLowerCase();
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

      if (
        name.includes('user') || name.includes('email') || name.includes('login') || name.includes('account') ||
        id.includes('user') || id.includes('email') || id.includes('login') || id.includes('account') ||
        placeholder.includes('user') || placeholder.includes('email') || placeholder.includes('login') ||
        autocomplete.includes('username') || autocomplete.includes('email') ||
        ariaLabel.includes('user') || ariaLabel.includes('email') || ariaLabel.includes('login')
      ) {
        return input;
      }
    }

    const allInputs = Array.from(container.querySelectorAll('input'));
    for (let i = 0; i < allInputs.length; i++) {
      if (allInputs[i] === pwdField && i > 0) {
        const prev = allInputs[i - 1];
        if (prev.type !== 'hidden' && prev.type !== 'submit' && prev.type !== 'checkbox') {
          return prev;
        }
      }
    }

    return null;
  }

  function findLoginForms() {
    const forms = [];
    const passwordFields = document.querySelectorAll('input[type="password"]');

    for (const pwdField of passwordFields) {
      if (pwdField.closest('.' + CV_ICON_CLASS)) continue;

      const container = pwdField.closest('form') || pwdField.parentElement;
      if (!container) continue;

      const usernameField = findUsernameField(pwdField, container);
      if (usernameField) {
        forms.push({ usernameField, passwordField: pwdField });
      }
    }

    return forms;
  }

  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    valueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  function createAutofillIcon(entry, passwordField) {
    const wrapper = document.createElement('div');
    wrapper.className = CV_ICON_CLASS;
    wrapper.setAttribute('data-cv-entry-id', entry.id);

    const rect = passwordField.getBoundingClientRect();
    wrapper.style.position = 'absolute';
    wrapper.style.left = (rect.right + 4 + window.scrollX) + 'px';
    wrapper.style.top = (rect.top + (rect.height - 22) / 2 + window.scrollY) + 'px';
    wrapper.style.zIndex = '2147483647';

    wrapper.title = `CipherVault: ${entry.title}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#6366f1');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z');
    svg.appendChild(path);
    wrapper.appendChild(svg);

    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: 'FROM_CONTENT',
        payload: { action: 'get-entry', id: entry.id }
      });
      removeIcons();
    }, { once: true });

    document.body.appendChild(wrapper);
    currentIcons.push(wrapper);
  }

  function removeIcons() {
    for (const icon of currentIcons) {
      icon.remove();
    }
    currentIcons = [];
  }

  function fillForm(username, password) {
    const forms = findLoginForms();
    for (const form of forms) {
      if (username && form.usernameField) {
        setNativeValue(form.usernameField, username);
        form.usernameField.focus();
      }
      if (password && form.passwordField) {
        setNativeValue(form.passwordField, password);
        form.passwordField.focus();
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.action) return;

    if (msg.action === 'search-result' && msg.entries) {
      removeIcons();
      const forms = findLoginForms();
      for (const form of forms) {
        for (const entry of msg.entries) {
          createAutofillIcon(entry, form.passwordField);
        }
      }
    }

    if (msg.action === 'entry-result' && msg.entry) {
      fillForm(msg.entry.username, msg.entry.password);
      removeIcons();
    }

    if (msg.action === 'status' && !msg.unlocked) {
      removeIcons();
    }
  });

  function onReady() {
    const domain = window.location.hostname;
    chrome.runtime.sendMessage({
      type: 'FROM_CONTENT',
      payload: { action: 'search', domain }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // Re-scan on navigation (SPA support)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      removeIcons();
      setTimeout(onReady, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
