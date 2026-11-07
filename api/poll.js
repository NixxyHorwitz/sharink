// api/poll.js - Vercel Serverless Function to Poll Links
const { getLinks } = require('./_storage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const pairCode = req.query.pairCode;
    const since = parseInt(req.query.since || '0', 10);

    if (!pairCode) {
      res.status(400).json({ success: false, error: 'pairCode parameter required' });
      return;
    }

    const links = await getLinks(pairCode, since);

    res.status(200).json({
      success: true,
      links,
      lastTimestamp: Date.now()
    });
  } catch (err) {
    console.error('api/poll error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
