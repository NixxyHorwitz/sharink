// server.js - Sharink Real-time Link Relay Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;

// In-memory data store
// rooms: Map<pairCode, { sockets: Set<WebSocket>, links: Array<Link>, lastActive: number }>
const rooms = new Map();

function getOrCreateRoom(rawCode) {
  const pairCode = String(rawCode || '').trim().toUpperCase();
  if (!pairCode) return null;

  if (!rooms.has(pairCode)) {
    rooms.set(pairCode, {
      sockets: new Set(),
      links: [],
      lastActive: Date.now()
    });
  }
  const room = rooms.get(pairCode);
  room.lastActive = Date.now();
  return room;
}

// Clean up inactive rooms older than 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.sockets.size === 0 && now - room.lastActive > 24 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 60 * 60 * 1000);

// Basic MIME types for static companion web app
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP Server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Healthcheck
  if (pathname === '/api/health' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() }));
    return;
  }

  // REST API: POST /api/send
  if (pathname === '/api/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { pairCode, url, title, sender } = payload;

        if (!pairCode || !url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'pairCode and url are required' }));
          return;
        }

        const room = getOrCreateRoom(pairCode);
        const linkItem = {
          id: 'link_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          url: url.trim(),
          title: (title || '').trim() || url.trim(),
          sender: (sender || 'Web').trim(),
          timestamp: Date.now()
        };

        // Save to room history (max 30 items)
        room.links.unshift(linkItem);
        if (room.links.length > 30) room.links.pop();

        // Broadcast to all connected sockets in this room
        const msg = JSON.stringify({ type: 'RECEIVE_LINK', ...linkItem });
        let sentCount = 0;
        room.sockets.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
            sentCount++;
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, link: linkItem, deliveredSockets: sentCount }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // REST API: GET /api/poll?pairCode=...&since=...
  if (pathname === '/api/poll' && req.method === 'GET') {
    const pairCode = parsedUrl.searchParams.get('pairCode');
    const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);

    if (!pairCode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'pairCode parameter required' }));
      return;
    }

    const room = getOrCreateRoom(pairCode);
    const newLinks = room.links.filter(l => l.timestamp > since);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, links: newLinks, lastTimestamp: Date.now() }));
    return;
  }

  // REST API: GET /api/history?pairCode=...
  if (pathname === '/api/history' && req.method === 'GET') {
    const pairCode = parsedUrl.searchParams.get('pairCode');
    if (!pairCode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'pairCode parameter required' }));
      return;
    }
    const room = getOrCreateRoom(pairCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, links: room.links }));
    return;
  }

  // Serve static files from ./public
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html
      filePath = path.join(__dirname, 'public', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentPairCode = null;
  let deviceName = 'Browser';
  let isAlive = true;

  ws.on('pong', () => { isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      switch (data.type) {
        case 'JOIN_ROOM': {
          const rawCode = String(data.pairCode || '').trim().toUpperCase();
          if (!rawCode) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Pair code required' }));
            return;
          }

          // Leave old room if switching
          if (currentPairCode && rooms.has(currentPairCode)) {
            rooms.get(currentPairCode).sockets.delete(ws);
          }

          currentPairCode = rawCode;
          deviceName = (data.deviceName || 'Browser').trim();

          const room = getOrCreateRoom(currentPairCode);
          room.sockets.add(ws);

          console.log(`[+] Device "${deviceName}" joined room: ${currentPairCode} (Total in room: ${room.sockets.size})`);

          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            pairCode: currentPairCode,
            devicesCount: room.sockets.size,
            history: room.links.slice(0, 10) // send recent 10 links
          }));

          // Notify others in room
          room.sockets.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'DEVICE_JOINED',
                deviceName,
                devicesCount: room.sockets.size
              }));
            }
          });
          break;
        }

        case 'SEND_LINK': {
          const pairCode = String(data.pairCode || currentPairCode || '').trim().toUpperCase();
          const url = (data.url || '').trim();
          const title = (data.title || url).trim();
          const sender = (data.sender || deviceName).trim();

          if (!pairCode || !url) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing pairCode or url' }));
            return;
          }

          const room = getOrCreateRoom(pairCode);
          const linkItem = {
            id: 'link_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            url,
            title,
            sender,
            timestamp: Date.now()
          };

          // Save link history
          room.links.unshift(linkItem);
          if (room.links.length > 30) room.links.pop();

          console.log(`[->] Link sent in [${pairCode}] by ${sender}: ${url}`);

          // Broadcast to ALL OTHER clients in room
          let broadcastedCount = 0;
          room.sockets.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'RECEIVE_LINK',
                ...linkItem
              }));
              broadcastedCount++;
            }
          });

          // Confirm back to sender
          ws.send(JSON.stringify({
            type: 'LINK_SENT_SUCCESS',
            id: linkItem.id,
            url: linkItem.url,
            deliveredTo: broadcastedCount
          }));
          break;
        }

        case 'PING': {
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (currentPairCode && rooms.has(currentPairCode)) {
      const room = rooms.get(currentPairCode);
      room.sockets.delete(ws);
      console.log(`[-] Device "${deviceName}" disconnected from room: ${currentPairCode} (Remaining: ${room.sockets.size})`);
      
      // Notify remaining clients
      room.sockets.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'DEVICE_LEFT',
            deviceName,
            devicesCount: room.sockets.size
          }));
        }
      });
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err.message);
  });
});

// Heartbeat interval to drop dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
=====================================================
  🔗 Sharink Relay Server is RUNNING!
  - HTTP & Web App:    http://localhost:${PORT}
  - WebSocket Relay:   ws://localhost:${PORT}
  - Environment PORT:  ${PORT}
=====================================================
`);
});

