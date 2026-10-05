const usernameEl = document.getElementById('account-username');
const form = document.getElementById('change-password-form');
const errorsEl = document.getElementById('change-password-errors');
const successEl = document.getElementById('change-password-success');

async function loadWhoami() {
  try {
    const res = await fetch('/api/whoami');
    if (!res.ok) return;
    const session = await res.json();
    usernameEl.textContent = session.username;
  } catch {
    // Sidebar/page still works without this — just skip the greeting.
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorsEl.innerHTML = '';
  successEl.hidden = true;

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    errorsEl.innerHTML = '<li>New password and confirmation do not match.</li>';
    return;
  }

  try {
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
    form.reset();
    successEl.hidden = false;
  } catch (err) {
    errorsEl.innerHTML = `<li>${err.message}</li>`;
  }
});

loadWhoami();
