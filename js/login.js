const form = document.getElementById('login-form');
const errorsEl = document.getElementById('login-errors');

function redirectTarget() {
  const target = new URLSearchParams(window.location.search).get('redirect');
  return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorsEl.innerHTML = '';
  const passphrase = document.getElementById('passphrase').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      errorsEl.innerHTML = `<li>${body.error || 'Sign in failed.'}</li>`;
      return;
    }
    window.location.href = redirectTarget();
  } catch (err) {
    errorsEl.innerHTML = `<li>Could not reach the server: ${err.message}</li>`;
  }
});
