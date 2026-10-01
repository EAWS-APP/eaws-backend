// InsForge database helper — drop-in replacement for mockDb queries
const fetch = globalThis.fetch || require('node-fetch');

const BASE = process.env.INSFORGE_URL || 'https://gcj3agx8.us-west.insforge.app';
const KEY  = process.env.INSFORGE_API_KEY || 'ik_a8ed83968d699a83aa3d6f3206b6e452';

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${KEY}`,
  ...extra
});

const db = {
  /** Select rows from a table. filter: object {col: val} or array of [col, op, val] */
  async select(table, { filter = {}, order, limit, offset } = {}) {
    let qs = [];
    for (const [k, v] of Object.entries(filter)) {
      qs.push(`${k}=eq.${encodeURIComponent(v)}`);
    }
    if (order)  qs.push(`order=${order}`);
    if (limit)  qs.push(`limit=${limit}`);
    if (offset) qs.push(`offset=${offset}`);
    const url = `${BASE}/api/database/records/${table}${qs.length ? '?' + qs.join('&') : ''}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`ifg.select(${table}): ${res.status} ${await res.text()}`);
    return res.json();
  },

  /** Insert a single row. Returns inserted row. */
  async insert(table, row) {
    const res = await fetch(`${BASE}/api/database/records/${table}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify([row])
    });
    if (!res.ok) throw new Error(`ifg.insert(${table}): ${res.status} ${await res.text()}`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },

  /** Update rows matching filter with patch object. Returns updated rows. */
  async update(table, filter, patch) {
    let qs = [];
    for (const [k, v] of Object.entries(filter)) {
      qs.push(`${k}=eq.${encodeURIComponent(v)}`);
    }
    const url = `${BASE}/api/database/records/${table}?${qs.join('&')}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error(`ifg.update(${table}): ${res.status} ${await res.text()}`);
    return res.json();
  },

  /** Delete rows matching filter. */
  async del(table, filter) {
    let qs = [];
    for (const [k, v] of Object.entries(filter)) {
      qs.push(`${k}=eq.${encodeURIComponent(v)}`);
    }
    const url = `${BASE}/api/database/records/${table}?${qs.join('&')}`;
    const res = await fetch(url, { method: 'DELETE', headers: headers() });
    if (!res.ok) throw new Error(`ifg.del(${table}): ${res.status} ${await res.text()}`);
    return res.json();
  }
};

module.exports = { db };
