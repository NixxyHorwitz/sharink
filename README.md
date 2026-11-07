# 🔗 Sharink - Cross-Device Link Sharing

**Sharink** adalah solusi mudah dan cepat untuk saling mengirim link antarbrowser di berbagai perangkat (PC/Laptop, Mac, HP Android, iPhone) menggunakan **Pair Code**.

---

## ⚡ Fitur Utama

- **Pair Code Instan:** Cukup samakan Pair Code (misal: `WORK-PC` atau `SHR-8921`) di kedua perangkat, perangkat langsung terhubung.
- **Kirim Tab Sekali Klik:** Tekan tombol *"Kirim Tab Ini Sekarang"*, dan link langsung terkirim ke perangkat pasangan.
- **Notifikasi Desktop Otomatis:** Perangkat penerima akan mendapatkan notifikasi desktop dengan judul & URL link.
- **Klik Langsung Buka:** Klik notifikasi atau tombol *"🚀 Buka Tab Sekarang"* pada notifikasi untuk langsung membuka halaman di tab baru.
- **Buka Otomatis (Opsional):** Opsi agar link langsung terbuka otomatis di tab baru tanpa harus mengklik notifikasi.
- **Pintasan Keyboard:** Tekan `Alt + Shift + S` untuk langsung mengirim tab aktif tanpa membuka popup!
- **Klik Kanan (Context Menu):** Klik kanan pada link atau halaman mana pun &rarr; pilih *"Kirim Halaman / Link via Sharink"*.
- **Web Companion (HP & Mobile):** Perangkat HP (Android / iOS) yang tidak bisa memasang ekstensi Chrome tetap bisa saling kirim & terima link melalui tampilan web companion!
- **Dual Support Server:** Bisa di-deploy ke **Render.com** (WebSocket 100% real-time seketika) atau ke **Vercel** (Serverless HTTP sync).

---

## 📂 Struktur Folder Proyek

```text
sharink/
├── extension/             <-- Ekstensi browser (Manifest V3)
│   ├── manifest.json
│   ├── background.js      <-- Service worker (WebSocket, notifikasi, shortcut)
│   ├── popup.html/.js/.css<-- Antarmuka popup browser
│   ├── options.html/.js   <-- Pengaturan (URL server, nama perangkat, auto-open)
│   └── icons/             <-- Icon ekstensi (16, 32, 48, 128)
│
├── public/                <-- Web companion untuk HP/browser tanpa ekstensi
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── api/                   <-- Serverless functions untuk Vercel
│   ├── send.js            (POST link)
│   ├── poll.js            (GET link terbaru)
│   └── health.js          (Healthcheck)
│
├── server.js              <-- Server Node.js (WebSocket Relay + HTTP Server)
├── package.json           <-- Konfigurasi Node.js
├── vercel.json            <-- Konfigurasi Vercel
└── run.bat                <-- Launcher server lokal (Windows)
```

---

## 🚀 1. Cara Pasang Ekstensi di Browser (Chrome / Edge / Brave)

1. Buka browser di Laptop / PC Anda.
2. Buka menu ekstensi:
   - **Google Chrome:** buka `chrome://extensions`
   - **Microsoft Edge:** buka `edge://extensions`
   - **Brave Browser:** buka `brave://extensions`
3. Aktifkan sakelar **Developer mode** (Mode pengembang) di sudut kanan atas.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar) di kiri atas.
5. Pilih folder:
   ```text
   C:\laragon\www\sharink\extension
   ```
6. Ekstensi **Sharink** berhasil dipasang! Sematkan (pin) icon Sharink di toolbar browser Anda.

---

## 🌐 2. Opsi Server

### Opsi A: Deploy ke Vercel (Gratis)

1. Pastikan project ini sudah di-push ke repository GitHub Anda (bisa otomatis via script atau GitHub CLI).
2. Buka [Vercel Dashboard](https://vercel.com/dashboard) &rarr; klik **"Add New Project"**.
3. Import repository GitHub `sharink`.
4. Klik **Deploy** (tanpa perlu ubah setting apa pun).
5. Vercel akan memberikan domain, misalnya: `https://sharink-xxx.vercel.app`.
6. Di ekstensi browser:
   - Buka icon Sharink &rarr; klik icon ⚙️ (Pengaturan).
   - Masukkan alamat server: `https://sharink-xxx.vercel.app` &rarr; klik **Simpan Pengaturan**.

> **Tips Vercel:** Vercel berjalan di lingkungan *Serverless*. Ekstensi akan otomatis beralih ke mode **HTTP Sync Polling** yang menyinkronkan link setiap beberapa detik. Untuk persistensi multi-container Vercel, Anda juga bisa menambahkan integrasi gratis **Upstash Redis** di dashboard Vercel.

---

### Opsi B: Deploy ke Render.com (WebSocket Murni - Paling Direkomendasikan!)

Render.com mendukung WebSocket persisten secara langsung (100% gratis), sehingga link terkirim seketika (< 10 milidetik).

1. Buka [Render.com](https://render.com) &rarr; klik **"New +"** &rarr; pilih **"Web Service"**.
2. Hubungkan repository GitHub `sharink`.
3. Atur konfigurasi:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
4. Klik **Create Web Service**.
5. Setelah beberapa saat, Render akan memberikan URL seperti: `https://sharink-app.onrender.com`.
6. Di ekstensi browser:
   - Ubah `https://` menjadi `wss://`, contoh: `wss://sharink-app.onrender.com`.
   - Simpan pengaturan di ekstensi. Status akan langsung berubah menjadi **WS Online** (Hijau)!

---

### Opsi C: Jalankan Lokal di Komputer Sendiri

Jika hanya ingin mengirim link antarperangkat di jaringan WiFi rumah yang sama:
1. Cukup dobel-klik file `run.bat` (atau jalankan `npm start` di folder ini).
2. Server WebSocket & Web aktif di `http://localhost:3000` (atau IP lokal Anda, misal `http://192.168.1.5:3000`).
3. Pada ekstensi gunakan: `ws://localhost:3000` (untuk PC ini) atau `ws://192.168.x.x:3000` (untuk laptop lain di WiFi yang sama).

---

## 📱 3. Cara Menggunakan Web Companion di HP (Android / iPhone)

1. Buka browser di HP (Chrome Mobile, Safari, dll).
2. Kunjungi alamat URL web server Anda (misal: `https://sharink-xxx.vercel.app` atau `https://sharink-app.onrender.com`).
3. Masukkan **Pair Code** yang sama dengan ekstensi di laptop Anda.
4. Klik **Sambungkan**.
5. Selesai! Kini Anda bisa:
   - Mengirim link dari HP ke laptop.
   - Menerima link dari laptop ke HP dengan tombol *"Buka Link ↗"*.

---

## ⌨️ Pintasan Cepat

| Aksi | Cara |
| :--- | :--- |
| **Kirim Tab Saat Ini** | Tekan `Alt + Shift + S` di keyboard |
| **Kirim via Klik Kanan** | Klik kanan pada link atau halaman &rarr; *Kirim via Sharink* |
| **Buka Otomatis** | Aktifkan di menu Pengaturan (⚙️) |

