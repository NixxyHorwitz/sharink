// api/send.js - Vercel Serverless Function to Send Link
const { saveLink } = require('./_storage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { pairCode, url, title, sender } = req.body || {};

    if (!pairCode || !url) {
      res.status(400).json({ success: false, error: 'pairCode and url are required' });
      return;
    }

    const linkItem = {
      id: 'link_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      url: url.trim(),
      title: (title || '').trim() || url.trim(),
      sender: (sender || 'Device').trim(),
      timestamp: Date.now()
    };

    await saveLink(pairCode, linkItem);

    res.status(200).json({ success: true, link: linkItem });
  } catch (err) {
    console.error('api/send error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

