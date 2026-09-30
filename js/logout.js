document.getElementById('logout-link')?.addEventListener('click', async (event) => {
  event.preventDefault();
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});
