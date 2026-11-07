// extension/popup.js
let currentTab = null;
let activeHistoryTab = 'received';

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

// Initialize popup
async function init() {
  // 1. Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTab = tab;
    currentTabTitle.textContent = tab.title || 'Tab Tanpa Judul';
    currentTabUrl.textContent = tab.url || '';
  }

  // 2. Load stored settings & history
  chrome.storage.local.get(['pairCode', 'serverUrl', 'receivedLinks', 'sentLinks'], (res) => {
    if (res.pairCode) {
      inputPairCode.value = res.pairCode;
      pairStatus.textContent = `Aktif di Pair: ${res.pairCode}`;
    } else {
      pairStatus.textContent = 'Silakan atur Pair Code untuk mulai berbagi.';
    }

    updateHistory(res.receivedLinks || [], res.sentLinks || []);
  });

  // 3. Check connection status with background worker
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
    if (status) {
      if (status.wsConnected) {
        connectionBadge.className = 'badge badge-connected';
        connectionBadge.textContent = 'WS Online';
      } else if (status.pollingActive) {
        connectionBadge.className = 'badge badge-sync';
        connectionBadge.textContent = 'HTTP Sync';
      } else {
        connectionBadge.className = 'badge badge-disconnected';
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
          connectionBadge.className = 'badge badge-connected';
          connectionBadge.textContent = 'WS Online';
        }
      });
    }, 1000);
  });
});

// Random Code Generator
btnRandomCode.addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'LINK-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  inputPairCode.value = code;
  btnSavePairCode.click();
});

// Send Current Active Tab
btnSendCurrentTab.addEventListener('click', async () => {
  if (!currentTab || !currentTab.url) return;

  btnSendCurrentTab.disabled = true;
  sendFeedback.className = 'feedback-msg';
  sendFeedback.textContent = 'Mengirim tab...';

  chrome.runtime.sendMessage({
    type: 'SEND_ACTIVE_TAB',
    url: currentTab.url,
    title: currentTab.title
  }, (response) => {
    btnSendCurrentTab.disabled = false;
    if (response?.success) {
      sendFeedback.className = 'feedback-msg success';
      sendFeedback.textContent = '✅ Berhasil terkirim ke perangkat paired!';
      // Refresh sent list
      chrome.storage.local.get(['receivedLinks', 'sentLinks'], (res) => {
        updateHistory(res.receivedLinks || [], res.sentLinks || []);
      });
      setTimeout(() => { sendFeedback.textContent = ''; }, 3500);
    } else {
      sendFeedback.className = 'feedback-msg error';
      sendFeedback.textContent = '❌ Gagal: ' + (response?.error || 'Periksa koneksi & Pair Code');
    }
  });
});

// Send Manual URL
btnSendManual.addEventListener('click', () => {
  const url = manualUrlInput.value.trim();
  if (!url) return;

  chrome.runtime.sendMessage({
    type: 'SEND_ACTIVE_TAB',
    url,
    title: url
  }, (response) => {
    if (response?.success) {
      manualUrlInput.value = '';
      sendFeedback.className = 'feedback-msg success';
      sendFeedback.textContent = '✅ Link manual terkirim!';
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
          <div class="history-item-meta">${item.sender || 'Device'} &bull; ${time}</div>
        </div>
        <button class="btn-open-tab" onclick="openLink('${safeUrl}')">Buka ↗</button>
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
