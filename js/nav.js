// Hides the sidebar's "Admin" link for anyone signed in as a general user —
// they'd otherwise click through to a dead 403 page, since /admin* is
// gated to the admin role by functions/_middleware.js regardless of what
// the nav shows. Included on every page; a no-op for admins.
async function hideAdminLinkForNonAdmins() {
  try {
    const res = await fetch('/api/whoami');
    if (!res.ok) return;
    const session = await res.json();
    if (session.role !== 'admin') {
      document.querySelector('.sidebar-nav a[href="admin.html"]')?.remove();
    }
  } catch {
    // Worst case the link stays visible — no functional harm, just a dead click.
  }
}

hideAdminLinkForNonAdmins();
