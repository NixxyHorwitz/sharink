// extension/options.js
const serverUrlInput = document.getElementById('serverUrl');
const deviceNameInput = document.getElementById('deviceName');
const autoOpenInput = document.getElementById('autoOpen');
const btnSave = document.getElementById('btnSave');
const btnTest = document.getElementById('btnTest');
const testResult = document.getElementById('testResult');

// Load stored settings
chrome.storage.local.get(['serverUrl', 'deviceName', 'autoOpen'], (res) => {
  serverUrlInput.value = res.serverUrl || 'ws://localhost:3000';
  deviceNameInput.value = res.deviceName || 'Browser PC';
  autoOpenInput.checked = !!res.autoOpen;
});

// Save settings
btnSave.addEventListener('click', () => {
  let url = serverUrlInput.value.trim();
  const device = deviceNameInput.value.trim() || 'Browser PC';
  const autoOpen = autoOpenInput.checked;

  if (!url) {
    url = 'ws://localhost:3000';
    serverUrlInput.value = url;
  }

  chrome.storage.local.set({
    serverUrl: url,
    deviceName: device,
    autoOpen: autoOpen
  }, () => {
    // Notify background worker to reconnect
    chrome.runtime.sendMessage({ type: 'RECONNECT' });

    testResult.className = 'test-result success';
    testResult.textContent = '✅ Pengaturan berhasil disimpan!';
    setTimeout(() => {
      testResult.style.display = 'none';
    }, 3000);
  });
});

// Test Connection
btnTest.addEventListener('click', async () => {
  const url = serverUrlInput.value.trim();
  testResult.className = 'test-result';
  testResult.style.display = 'block';
  testResult.textContent = 'Sedang menguji koneksi...';

  if (!url) {
    testResult.className = 'test-result error';
    testResult.textContent = 'Harap isi URL server terlebih dahulu.';
    return;
  }

  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    testWebSocket(url);
  } else {
    testHttp(url);
  }
});

function testWebSocket(wsUrl) {
  let finished = false;
  try {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { ws.close(); } catch (e) {}
        testResult.className = 'test-result error';
        testResult.textContent = '❌ Gagal: Waktu koneksi WebSocket habis (timeout).';
      }
    }, 5000);

    ws.onopen = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        ws.close();
        testResult.className = 'test-result success';
        testResult.textContent = '✅ Sukses: Koneksi WebSocket berhasil terhubung!';
      }
    };

    ws.onerror = (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        testResult.className = 'test-result error';
        testResult.textContent = '❌ Gagal: Tidak dapat terhubung ke WebSocket. Pastikan server aktif dan URL benar.';
      }
    };
  } catch (err) {
    testResult.className = 'test-result error';
    testResult.textContent = '❌ Error: ' + err.message;
  }
}

async function testHttp(httpUrl) {
  const clean = httpUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${clean}/api/health`);
    if (res.ok) {
      const data = await res.json();
      testResult.className = 'test-result success';
      testResult.textContent = `✅ Sukses: Server HTTP merespons dengan status OK (${data.platform || 'node'})!`;
    } else {
      throw new Error(`Server status ${res.status}`);
    }
  } catch (err) {
    testResult.className = 'test-result error';
    testResult.textContent = '❌ Gagal terhubung ke HTTP endpoint: ' + err.message;
  }
}
