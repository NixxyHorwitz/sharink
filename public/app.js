// public/app.js - Sharink Web Companion
let ws = null;
let pollTimer = null;
let currentPairCode = localStorage.getItem('sharink_pair_code') || 'FAHRI-JIHAN';
let lastPollTimestamp = 0;
let receivedLinks = [];

const pairCodeInput = document.getElementById('pairCodeInput');
const btnJoin = document.getElementById('btnJoin');
const btnGenerate = document.getElementById('btnGenerate');
const linkUrlInput = document.getElementById('linkUrlInput');
const linkTitleInput = document.getElementById('linkTitleInput');
const btnSend = document.getElementById('btnSend');
const sendFeedback = document.getElementById('sendFeedback');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const deviceCount = document.getElementById('deviceCount');
const linksList = document.getElementById('linksList');
const autoOpenToggle = document.getElementById('autoOpenToggle');
const bannerImg = document.getElementById('bannerImg');
const avatarFahri = document.getElementById('avatarFahri');
const avatarJihan = document.getElementById('avatarJihan');

// Interactive banner photo switcher
if (bannerImg) {
  const images = ['couple.jpg', 'jihan.jpg', 'fahri.jpg'];
  let currentIdx = 0;

  bannerImg.addEventListener('click', () => {
    currentIdx = (currentIdx + 1) % images.length;
    bannerImg.style.opacity = '0.5';
    setTimeout(() => {
      bannerImg.src = images[currentIdx];
      bannerImg.style.opacity = '1';
    }, 120);
    playBeep();
  });

  if (avatarFahri) {
    avatarFahri.addEventListener('click', () => {
      bannerImg.style.opacity = '0.5';
      setTimeout(() => {
        bannerImg.src = 'fahri.jpg';
        bannerImg.style.opacity = '1';
      }, 120);
      playBeep();
    });
  }

  if (avatarJihan) {
    avatarJihan.addEventListener('click', () => {
      bannerImg.style.opacity = '0.5';
      setTimeout(() => {
        bannerImg.src = 'jihan.jpg';
        bannerImg.style.opacity = '1';
      }, 120);
      playBeep();
    });
  }
}

// Initialize UI
if (currentPairCode) {
  pairCodeInput.value = currentPairCode;
}
autoOpenToggle.checked = localStorage.getItem('sharink_auto_open') === 'true';

autoOpenToggle.addEventListener('change', () => {
  localStorage.setItem('sharink_auto_open', autoOpenToggle.checked);
});

// Random code generator
btnGenerate.addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SHR-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  pairCodeInput.value = code;
  joinRoom(code);
});

btnJoin.addEventListener('click', () => {
  const code = pairCodeInput.value.trim().toUpperCase();
  if (!code) return;
  joinRoom(code);
});

function setStatus(connected, text) {
  if (connected) {
    statusBadge.classList.add('connected');
    statusText.textContent = text || 'Terhubung';
  } else {
    statusBadge.classList.remove('connected');
    statusText.textContent = text || 'Terputus';
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Audio context may require user gesture
  }
}

function joinRoom(code) {
  currentPairCode = code;
  localStorage.setItem('sharink_pair_code', code);
  pairCodeInput.value = code;

  // Clear any existing polling
  if (pollTimer) clearInterval(pollTimer);

  // Determine WebSocket or Polling based on protocol
  const loc = window.location;
  const isHttps = loc.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${loc.host}`;

  try {
    if (ws) {
      ws.close();
      ws = null;
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus(true, 'WebSocket Terhubung');
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        pairCode: code,
        deviceName: 'Web Browser (' + (navigator.userAgentData?.platform || 'Device') + ')'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ROOM_JOINED') {
          deviceCount.textContent = `(${msg.devicesCount || 1} perangkat aktif)`;
          if (Array.isArray(msg.history)) {
            receivedLinks = msg.history;
            renderLinks();
          }
        } else if (msg.type === 'DEVICE_JOINED' || msg.type === 'DEVICE_LEFT') {
          deviceCount.textContent = `(${msg.devicesCount || 1} perangkat aktif)`;
        } else if (msg.type === 'RECEIVE_LINK') {
          handleIncomingLink(msg);
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => {
      // If WebSocket fails (e.g. deployed to pure Vercel serverless without WS)
      startHttpPolling(code);
    };

    ws.onclose = () => {
      // Fallback to polling or reconnect
      setTimeout(() => {
        if (currentPairCode === code && (!ws || ws.readyState === WebSocket.CLOSED)) {
          startHttpPolling(code);
        }
      }, 2000);
    };
  } catch (e) {
    startHttpPolling(code);
  }
}

// Polling fallback (essential for Vercel Serverless environment!)
function startHttpPolling(code) {
  setStatus(true, 'HTTP Sync Aktif');
  
  const poll = async () => {
    try {
      const res = await fetch(`/api/poll?pairCode=${encodeURIComponent(code)}&since=${lastPollTimestamp}`);
      if (res.ok) {
        const data = await res.json();
        if (data.links && data.links.length > 0) {
          data.links.forEach(handleIncomingLink);
        }
        lastPollTimestamp = data.lastTimestamp || Date.now();
      }
    } catch (e) {
      setStatus(false, 'Gagal Polling');
    }
  };

  poll();
  pollTimer = setInterval(poll, 3000);
}

function handleIncomingLink(item) {
  // Avoid duplicate IDs
  if (receivedLinks.some(l => l.id === item.id)) return;

  receivedLinks.unshift(item);
  renderLinks();
  playBeep();

  // Desktop notification if granted
  if (Notification && Notification.permission === 'granted') {
    new Notification('🔗 Link Baru: ' + (item.title || 'Sharink'), {
      body: item.url,
      icon: 'icon48.png'
    });
  }

  // Auto open if toggle enabled
  if (autoOpenToggle.checked && item.url) {
    window.open(item.url, '_blank');
  }
}

function renderLinks() {
  if (receivedLinks.length === 0) {
    linksList.innerHTML = `
      <div class="empty-state">
        Belum ada link yang diterima. Hubungkan kode yang sama di perangkat lain dan kirim link!
      </div>
    `;
    return;
  }

  linksList.innerHTML = receivedLinks.map(link => {
    const timeStr = new Date(link.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const safeTitle = escapeHtml(link.title || link.url);
    const safeUrl = escapeHtml(link.url);
    const safeSender = escapeHtml(link.sender || 'Device');

    return `
      <div class="link-item">
        <div class="link-item-header">
          <div class="link-item-title">${safeTitle}</div>
          <div class="link-item-time">${safeSender} &bull; ${timeStr}</div>
        </div>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-item-url">${safeUrl}</a>
        <div class="link-item-actions">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-open">Buka Link ↗</a>
          <button class="btn btn-copy" onclick="copyLink('${escapeQuotes(link.url)}')">Salin</button>
        </div>
      </div>
    `;
  }).join('');
}

window.copyLink = (url) => {
  navigator.clipboard.writeText(url).then(() => {
    alert('Link disalin ke clipboard!');
  });
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function escapeQuotes(str) {
  return String(str || '').replace(/'/g, "\\'");
}

// Send Link
btnSend.addEventListener('click', async () => {
  const url = linkUrlInput.value.trim();
  const title = linkTitleInput.value.trim();

  if (!currentPairCode) {
    sendFeedback.className = 'feedback-msg error';
    sendFeedback.textContent = 'Harap sambungkan Pair Code terlebih dahulu!';
    return;
  }

  if (!url) {
    sendFeedback.className = 'feedback-msg error';
    sendFeedback.textContent = 'Masukkan URL yang valid!';
    return;
  }

  sendFeedback.textContent = 'Mengirim...';

  // Send via WebSocket if connected
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SEND_LINK',
      pairCode: currentPairCode,
      url,
      title: title || url,
      sender: 'Web Companion'
    }));
    sendFeedback.className = 'feedback-msg success';
    sendFeedback.textContent = 'Link berhasil dikirim!';
    linkUrlInput.value = '';
    linkTitleInput.value = '';
    setTimeout(() => { sendFeedback.textContent = ''; }, 3000);
  } else {
    // Send via HTTP REST
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairCode: currentPairCode,
          url,
          title: title || url,
          sender: 'Web Companion'
        })
      });
      const data = await res.json();
      if (data.success) {
        sendFeedback.className = 'feedback-msg success';
        sendFeedback.textContent = 'Link berhasil dikirim!';
        linkUrlInput.value = '';
        linkTitleInput.value = '';
        setTimeout(() => { sendFeedback.textContent = ''; }, 3000);
      } else {
        throw new Error(data.error || 'Gagal mengirim link');
      }
    } catch (err) {
      sendFeedback.className = 'feedback-msg error';
      sendFeedback.textContent = 'Gagal mengirim: ' + err.message;
    }
  }
});

// Auto-connect if pair code already exists
if (currentPairCode) {
  joinRoom(currentPairCode);
}

