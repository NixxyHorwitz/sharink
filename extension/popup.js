// extension/popup.js
let currentTab = null;
let activeHistoryTab = 'received';

const statusDot = document.getElementById('statusDot');
const connectionBadge = document.getElementById('connectionBadge');
const btnOpenOptions = document.getElementById('btnOpenOptions');
const currentTabTitle = document.getElementById('currentTabTitle');
const currentTabUrl = document.getElementById('currentTabUrl');
const btnSendCurrentTab = document.getElementById('btnSendCurrentTab');
const sendFeedback = document.getElementById('sendFeedback');
const inputPairCode = document.getElementById('inputPairCode');
const btnSavePairCode = document.getElementById('btnSavePairCode');
const btnRandomCode = document.getElementById('btnRandomCode');
const pairStatus = document.getElementById('pairStatus');
const manualUrlInput = document.getElementById('manualUrlInput');
const btnSendManual = document.getElementById('btnSendManual');
const tabReceivedBtn = document.getElementById('tabReceivedBtn');
const tabSentBtn = document.getElementById('tabSentBtn');
const historyList = document.getElementById('historyList');
const receivedCount = document.getElementById('receivedCount');
const sentCount = document.getElementById('sentCount');
const heartsContainer = document.getElementById('heartsContainer');

// Heart burst animation
function triggerHeartBurst() {
  const emojis = ['❤️', '💖', '💕', '✨', '🌸', '💘'];
  for (let i = 0; i < 7; i++) {
    const el = document.createElement('span');
    el.className = 'floating-heart';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = (35 + Math.random() * 35) + '%';
    el.style.top = '120px';
    el.style.animationDelay = (i * 0.08) + 's';
    heartsContainer.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1500);
  }
}

// Initialize popup
async function init() {
  // 1. Get current active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTab = tab;
      currentTabTitle.textContent = tab.title || 'Tab Tanpa Judul';
      currentTabUrl.textContent = tab.url || '';
    }
  } catch (e) {
    currentTabTitle.textContent = 'Siap mengirim link';
  }

  // 2. Load stored settings & history
  chrome.storage.local.get(['pairCode', 'serverUrl', 'receivedLinks', 'sentLinks'], (res) => {
    // If no pair code set yet, default to sweet couple code FAHRI-JIHAN
    const initialCode = res.pairCode || 'FAHRI-JIHAN';
    inputPairCode.value = initialCode;
    pairStatus.textContent = `Tersambung ke Pair: ${initialCode}`;

    if (!res.pairCode) {
      // Auto-save default code so user doesn't even need to type!
      chrome.storage.local.set({ pairCode: initialCode }, () => {
        chrome.runtime.sendMessage({ type: 'RECONNECT' });
      });
    }

    updateHistory(res.receivedLinks || [], res.sentLinks || []);
  });

  // 3. Check connection status with background worker
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
    if (status) {
      if (status.wsConnected) {
        statusDot.className = 'status-indicator online';
        connectionBadge.textContent = 'Online (WS)';
      } else if (status.pollingActive) {
        statusDot.className = 'status-indicator sync';
        connectionBadge.textContent = 'Sync Aktif';
      } else {
        statusDot.className = 'status-indicator offline';
        connectionBadge.textContent = 'Offline';
      }
    }
  });
}

// Open Options Page
btnOpenOptions.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

// Save Pair Code
btnSavePairCode.addEventListener('click', () => {
  const code = inputPairCode.value.trim().toUpperCase();
  if (!code) {
    pairStatus.textContent = '⚠️ Masukkan kode yang valid!';
    return;
  }

  chrome.storage.local.set({ pairCode: code }, () => {
    pairStatus.textContent = `Tersimpan: ${code}`;
    chrome.runtime.sendMessage({ type: 'RECONNECT' });
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
        if (status?.wsConnected) {
          statusDot.className = 'status-indicator online';
          connectionBadge.textContent = 'Online (WS)';
        }
      });
    }, 1000);
  });
});

// Random Code Generator
btnRandomCode.addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'LOVE-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  inputPairCode.value = code;
  btnSavePairCode.click();
});

// Send Current Active Tab
btnSendCurrentTab.addEventListener('click', async () => {
  if (!currentTab || !currentTab.url) return;

  triggerHeartBurst();
  btnSendCurrentTab.disabled = true;
  sendFeedback.className = 'feedback-msg';
  sendFeedback.textContent = 'Mengirim tab dengan cinta...';

  chrome.runtime.sendMessage({
    type: 'SEND_ACTIVE_TAB',
    url: currentTab.url,
    title: currentTab.title
  }, (response) => {
    btnSendCurrentTab.disabled = false;
    if (response?.success) {
      sendFeedback.className = 'feedback-msg success';
      sendFeedback.textContent = '💖 Link berhasil terkirim ke pasangan!';
      // Refresh sent list
      chrome.storage.local.get(['receivedLinks', 'sentLinks'], (res) => {
        updateHistory(res.receivedLinks || [], res.sentLinks || []);
      });
      setTimeout(() => { sendFeedback.textContent = ''; }, 3500);
    } else {
      sendFeedback.className = 'feedback-msg error';
      sendFeedback.textContent = '❌ Gagal: ' + (response?.error || 'Periksa server');
    }
  });
});

// Send Manual URL
btnSendManual.addEventListener('click', () => {
  const url = manualUrlInput.value.trim();
  if (!url) return;

  triggerHeartBurst();
  chrome.runtime.sendMessage({
    type: 'SEND_ACTIVE_TAB',
    url,
    title: url
  }, (response) => {
    if (response?.success) {
      manualUrlInput.value = '';
      sendFeedback.className = 'feedback-msg success';
      sendFeedback.textContent = '💖 Link manual terkirim!';
      setTimeout(() => { sendFeedback.textContent = ''; }, 3000);
    }
  });
});

// Tab Switcher
tabReceivedBtn.addEventListener('click', () => {
  activeHistoryTab = 'received';
  tabReceivedBtn.classList.add('active');
  tabSentBtn.classList.remove('active');
  loadHistoryView();
});

tabSentBtn.addEventListener('click', () => {
  activeHistoryTab = 'sent';
  tabSentBtn.classList.add('active');
  tabReceivedBtn.classList.remove('active');
  loadHistoryView();
});

function updateHistory(received, sent) {
  receivedCount.textContent = received.length;
  sentCount.textContent = sent.length;
  loadHistoryView();
}

function loadHistoryView() {
  chrome.storage.local.get(['receivedLinks', 'sentLinks'], (res) => {
    const list = activeHistoryTab === 'received' ? (res.receivedLinks || []) : (res.sentLinks || []);
    renderHistoryItems(list);
  });
}

function renderHistoryItems(items) {
  if (!items || items.length === 0) {
    historyList.innerHTML = `<div class="empty-state">Belum ada riwayat ${activeHistoryTab === 'received' ? 'link masuk' : 'link terkirim'}.</div>`;
    return;
  }

  historyList.innerHTML = items.slice(0, 15).map(item => {
    const time = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const safeTitle = escapeHtml(item.title || item.url);
    const safeUrl = escapeQuotes(item.url);

    return `
      <div class="history-item">
        <div class="history-item-content">
          <div class="history-item-title" title="${safeTitle}">${safeTitle}</div>
          <div class="history-item-meta">${item.sender || 'Pasangan'} &bull; ${time}</div>
        </div>
        <button class="btn-open-link" onclick="openLink('${safeUrl}')">Buka ↗</button>
      </div>
    `;
  }).join('');
}

window.openLink = (url) => {
  chrome.tabs.create({ url });
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

init();
