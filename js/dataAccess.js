/**
 * Data access layer for the shared UTM view. One interface, two
 * implementations — swap which one is active by changing the single
 * constant below. Nothing else in the app touches storage directly.
 */

// Swap point: 'mock' (localStorage, works with no backend) or 'cloudflare'
// (Cloudflare Pages Functions + KV — see functions/api/utms.js).
const BACKEND = 'mock';

const STORAGE_KEY = 'utm-builder:records';

const mockDataAccess = {
  async list() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  async append(records) {
    const existing = await this.list();
    const updated = existing.concat(records);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  },
};

const cloudflareDataAccess = {
  async list() {
    const res = await fetch('/api/utms');
    if (!res.ok) throw new Error(`Failed to load shared view (${res.status}).`);
    return res.json();
  },
  async append(records) {
    const res = await fetch('/api/utms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    });
    if (!res.ok) throw new Error(`Failed to save UTMs (${res.status}).`);
    return res.json();
  },
};

export const dataAccess = BACKEND === 'cloudflare' ? cloudflareDataAccess : mockDataAccess;
