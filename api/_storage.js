// api/_storage.js - Storage helper for Vercel Serverless
// Supports Upstash Redis REST (zero npm packages required) or in-memory fallback

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Global fallback in memory (best-effort across warm lambdas)
if (!global._sharink_store) {
  global._sharink_store = new Map();
}

async function saveLink(pairCode, linkItem) {
  const code = String(pairCode || '').trim().toUpperCase();

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const key = `sharink:${code}`;
      // Push to list and trim to 30 items, expire in 24h
      await fetch(`${UPSTASH_URL}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          ['LPUSH', key, JSON.stringify(linkItem)],
          ['LTRIM', key, 0, 29],
          ['EXPIRE', key, 86400]
        ])
      });
      return true;
    } catch (e) {
      console.error('Upstash save error:', e);
    }
  }

  // Fallback in-memory
  if (!global._sharink_store.has(code)) {
    global._sharink_store.set(code, []);
  }
  const list = global._sharink_store.get(code);
  list.unshift(linkItem);
  if (list.length > 30) list.pop();
  return true;
}

async function getLinks(pairCode, since = 0) {
  const code = String(pairCode || '').trim().toUpperCase();

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const key = `sharink:${code}`;
      const res = await fetch(`${UPSTASH_URL}/lrange/${key}/0/29`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const data = await res.json();
      if (data && Array.isArray(data.result)) {
        const parsed = data.result.map(item => typeof item === 'string' ? JSON.parse(item) : item);
        return since > 0 ? parsed.filter(l => l.timestamp > since) : parsed;
      }
    } catch (e) {
      console.error('Upstash get error:', e);
    }
  }

  // Fallback in-memory
  const list = global._sharink_store.get(code) || [];
  return since > 0 ? list.filter(l => l.timestamp > since) : list;
}

module.exports = { saveLink, getLinks };

