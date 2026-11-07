// extension/background.js - Sharink Background Service Worker
let socket = null;
let reconnectTimer = null;
let pollInterval = null;
let lastPollTimestamp = 0;
const notificationMap = new Map(); // id -> url

// Default configuration
const DEFAULT_CONFIG = {
  serverUrl: 'ws://localhost:3000',
  pairCode: '',
  deviceName: 'Browser PC',
  autoOpen: false,
  soundAlert: true
};

// Initialize configuration
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULT_CONFIG), (res) => {
    const toSet = {};
    for (const key in DEFAULT_CONFIG) {
      if (res[key] === undefined) toSet[key] = DEFAULT_CONFIG[key];
    }
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet);
    }
  });

  // Setup Context Menus
  chrome.contextMenus.create({
    id: 'sharink-send-page',
    title: '🔗 Kirim Halaman Ini via Sharink',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'sharink-send-link',
    title: '🔗 Kirim Link Ini via Sharink',
    contexts: ['link']
  });

  // Setup periodic keepalive alarm (every 1 minute)
  chrome.alarms.create('sharink_keepalive', { periodInMinutes: 1 });
});

// Setup Connection based on stored settings
function setupConnection() {
  chrome.storage.local.get(['serverUrl', 'pairCode', 'deviceName'], (config) => {
    const serverUrl = (config.serverUrl || DEFAULT_CONFIG.serverUrl).trim();
    const pairCode = (config.pairCode || '').trim().toUpperCase();
    const deviceName = (config.deviceName || DEFAULT_CONFIG.deviceName).trim();

    if (!pairCode) {
      chrome.action.setBadgeText({ text: 'PAIR' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      return;
    }

    if (serverUrl.startsWith('ws://') || serverUrl.startsWith('wss://')) {
      connectWebSocket(serverUrl, pairCode, deviceName);
    } else if (serverUrl.startsWith('http://') || serverUrl.startsWith('https://')) {
      startHttpPolling(serverUrl, pairCode);
    }
  });
}

// ----------------- WebSocket Mode -----------------
function connectWebSocket(serverUrl, pairCode, deviceName) {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    try { socket.close(); } catch (e) {}
  }

  try {
    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });

      socket.send(JSON.stringify({
        type: 'JOIN_ROOM',
        pairCode,
        deviceName
      }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'RECEIVE_LINK') {
          handleIncomingLink(data);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    socket.onclose = () => {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

      // Exponential backoff or reconnect
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(setupConnection, 5000);
    };

    socket.onerror = (err) => {
      console.warn('WS error:', err);
    };
  } catch (err) {
    console.error('WS init error:', err);
  }
}

// ----------------- HTTP Polling Mode (for Vercel Serverless) -----------------
function startHttpPolling(serverUrl, pairCode) {
  if (socket) {
    try { socket.close(); } catch (e) {}
    socket = null;
  }

  chrome.action.setBadgeText({ text: 'SYNC' });
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });

  const poll = async () => {
    try {
      const cleanUrl = serverUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/api/poll?pairCode=${encodeURIComponent(pairCode)}&since=${lastPollTimestamp}`);
      if (res.ok) {
        const data = await res.json();
        if (data.links && Array.isArray(data.links)) {
          data.links.forEach(handleIncomingLink);
        }
        lastPollTimestamp = data.lastTimestamp || Date.now();
      }
    } catch (e) {
      console.warn('HTTP Poll error:', e);
    }
  };

  if (pollInterval) clearInterval(pollInterval);
  poll();
  pollInterval = setInterval(poll, 4000);
}

// ----------------- Handle Incoming Link -----------------
function handleIncomingLink(linkData) {
  const { id, url, title, sender } = linkData;
  if (!url) return;

  // Save to received links history
  chrome.storage.local.get(['receivedLinks', 'autoOpen'], (res) => {
    const list = res.receivedLinks || [];
    // Avoid duplicate
    if (list.some(l => l.id === id || (l.url === url && Math.abs(l.timestamp - linkData.timestamp) < 3000))) {
      return;
    }

    list.unshift(linkData);
    if (list.length > 50) list.pop();
    chrome.storage.local.set({ receivedLinks: list });

    // Auto open if enabled
    if (res.autoOpen) {
      chrome.tabs.create({ url, active: true });
    }

    // Show Desktop Notification
    const notifId = 'sharink_' + (id || Date.now());
    notificationMap.set(notifId, url);

    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `Link Masuk dari ${sender || 'Perangkat Lain'}!`,
      message: `${title || 'Ada link baru'}\n${url}`,
      contextMessage: 'Klik notifikasi untuk membuka tab',
      buttons: [
        { title: '🚀 Buka Tab Sekarang' },
        { title: '📋 Salin Link' }
      ],
      priority: 2,
      requireInteraction: true
    });
  });
}

// ----------------- Notification Click Handlers -----------------
chrome.notifications.onClicked.addListener((notificationId) => {
  const url = notificationMap.get(notificationId);
  if (url) {
    chrome.tabs.create({ url });
    chrome.notifications.clear(notificationId);
    notificationMap.delete(notificationId);
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  const url = notificationMap.get(notificationId);
  if (!url) return;

  if (buttonIndex === 0) {
    // Buka tab
    chrome.tabs.create({ url });
  } else if (buttonIndex === 1) {
    // Note: in service worker, clipboard can be written via offscreen or basic notification
    // We can open tab or dismiss
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Link Siap Dibuka',
      message: url,
      priority: 1
    });
  }
  chrome.notifications.clear(notificationId);
  notificationMap.delete(notificationId);
});

// ----------------- Send Link Function -----------------
async function sendLink(url, title) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['serverUrl', 'pairCode', 'deviceName'], async (config) => {
      const serverUrl = (config.serverUrl || DEFAULT_CONFIG.serverUrl).trim();
      const pairCode = (config.pairCode || '').trim().toUpperCase();
      const sender = (config.deviceName || DEFAULT_CONFIG.deviceName).trim();

      if (!pairCode) {
        resolve({ success: false, error: 'Pair Code belum diisi!' });
        return;
      }

      // Try WebSocket first if open
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'SEND_LINK',
          pairCode,
          url,
          title: title || url,
          sender
        }));
        recordSentLink({ url, title, sender, timestamp: Date.now() });
        resolve({ success: true, via: 'websocket' });
        return;
      }

      // Fallback or Direct HTTP API (Vercel or standard HTTP)
      try {
        let httpEndpoint = serverUrl;
        if (httpEndpoint.startsWith('ws://')) httpEndpoint = httpEndpoint.replace('ws://', 'http://');
        if (httpEndpoint.startsWith('wss://')) httpEndpoint = httpEndpoint.replace('wss://', 'https://');
        httpEndpoint = httpEndpoint.replace(/\/+$/, '') + '/api/send';

        const res = await fetch(httpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairCode, url, title, sender })
        });
        const data = await res.json();
        if (data.success) {
          recordSentLink({ url, title, sender, timestamp: Date.now() });
          resolve({ success: true, via: 'http' });
        } else {
          resolve({ success: false, error: data.error || 'Gagal mengirim link' });
        }
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });
}

function recordSentLink(item) {
  chrome.storage.local.get(['sentLinks'], (res) => {
    const list = res.sentLinks || [];
    list.unshift(item);
    if (list.length > 50) list.pop();
    chrome.storage.local.set({ sentLinks: list });
  });
}

// ----------------- Context Menu Listener -----------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sharink-send-page') {
    const url = tab?.url || info.pageUrl;
    const title = tab?.title || url;
    if (url) {
      sendLink(url, title).then(res => {
        showSendFeedback(res.success, title);
      });
    }
  } else if (info.menuItemId === 'sharink-send-link') {
    const url = info.linkUrl;
    if (url) {
      sendLink(url, url).then(res => {
        showSendFeedback(res.success, url);
      });
    }
  }
});

// ----------------- Keyboard Shortcut Listener -----------------
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-current-tab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const res = await sendLink(tab.url, tab.title);
      showSendFeedback(res.success, tab.title);
    }
  }
});

function showSendFeedback(success, label) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: success ? '✅ Berhasil Terkirim!' : '❌ Gagal Mengirim Link',
    message: success ? `Link "${label || 'Tab'}" telah dikirim ke perangkat pasangan.` : 'Pastikan server aktif dan Pair Code sesuai.',
    priority: 1
  });
}

// ----------------- Message Listener from Popup/Options -----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RECONNECT') {
    setupConnection();
    sendResponse({ success: true });
  } else if (msg.type === 'SEND_ACTIVE_TAB') {
    sendLink(msg.url, msg.title).then(sendResponse);
    return true; // Keep message channel open for async response
  } else if (msg.type === 'GET_STATUS') {
    const isWsOpen = socket && socket.readyState === WebSocket.OPEN;
    sendResponse({
      wsConnected: isWsOpen,
      pollingActive: !!pollInterval
    });
  }
});

// ----------------- Alarms for MV3 Service Worker KeepAlive -----------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sharink_keepalive') {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setupConnection();
    } else {
      // Ping server to keep connection warm
      socket.send(JSON.stringify({ type: 'PING' }));
    }
  }
});

// Start connection on service worker launch
setupConnection();

