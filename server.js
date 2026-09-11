require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_PIN_SECRET = process.env.ADMIN_PIN || "123456";

// MANAJEMEN DATABASE API KEYS (FILE JSON)
const DB_FILE = path.join(__dirname, 'apikeys.json');

function getApiKeys() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultKeys = [{ key: "MY_SECRET_API_KEY_123", active: true }];
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultKeys, null, 2));
    return defaultKeys;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function saveApiKeys(keys) {
  fs.writeFileSync(DB_FILE, JSON.stringify(keys, null, 2));
}

// HELPER: FORMAT EMAIL & SUPPORT CUSTOM/TEMP MAIL
function formatTargetEmail(inputEmail) {
  let email = inputEmail.trim();
  if (!email.includes('@')) {
    email = `${email}@gmail.com`;
  }
  return email.toLowerCase();
}

// MIDDLEWARE VALIDASI API KEY
const validateApiKey = (req, res, next) => {
  const apiKey = req.query.apikey || req.headers['x-api-key'];
  const keys = getApiKeys();

  const foundKey = keys.find(k => k.key === apiKey);

  if (!foundKey) {
    return res.status(401).json({ status: false, message: 'API Key tidak ditemukan / tidak valid!' });
  }

  if (!foundKey.active) {
    return res.status(403).json({ status: false, message: 'API Key telah dinonaktifkan (Disabled) oleh Admin!' });
  }

  next();
};

// MIDDLEWARE VALIDASI PIN ADMIN
const validateAdminPin = (req, res, next) => {
  const pin = req.query.pin || req.body.pin;
  if (pin !== ADMIN_PIN_SECRET) {
    return res.status(401).json({ status: false, message: 'PIN Admin tidak valid!' });
  }
  next();
};

// KONFIGURASI NODEMAILER
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// SIMPAN VERIFICATION CODES SEMENTARA
const pendingVerifications = new Map();

// ==================== ENDPOINT REST API ==================== //

// 1. ENDPOINT: Send Magic Link (Mendukung Temp Mail / Custom Domain)
app.get('/api/alight/send', validateApiKey, async (req, res) => {
  try {
    let { email } = req.query;
    if (!email) return res.status(400).json({ status: false, message: 'Parameter email wajib diisi!' });

    const targetEmail = formatTargetEmail(email);

    // Buat Token / Link Verifikasi Acak
    const verificationCode = "AM-VERIFY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const mockVerificationLink = `https://alightmotion.com/verify?code=${verificationCode}&email=${encodeURIComponent(targetEmail)}`;

    // Simpan ke memory untuk diverifikasi nanti
    pendingVerifications.set(targetEmail, verificationCode);

    // Kirim Email berisi Link ke User
    const mailOptions = {
      from: `"Alight Motion Premium" <${process.env.GMAIL_USER}>`,
      to: targetEmail,
      subject: `Link Verifikasi Premium Alight Motion`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #0b0e14; padding: 25px; color: #ffffff; border-radius: 12px; max-width: 480px; margin: auto;">
          <h2 style="color: #00e676; text-align: center;">Alight Motion Premium</h2>
          <p style="color: #ccc;">Halo <b>${targetEmail}</b>,</p>
          <p style="color: #ccc;">Salin (copy) link verifikasi di bawah ini dan masukkan ke kolom <b>Verify Magic Link</b> di website dashboard:</p>
          <div style="background: #151a23; padding: 12px; border-radius: 6px; font-family: monospace; word-break: break-all; color: #38ef7d; border: 1px solid #232d3f; margin: 15px 0;">
            ${mockVerificationLink}
          </div>
          <p style="font-size: 11px; color: #8899a6;">Jangan klik link di atas. Cukup salin link-nya lalu tempelkan (paste) di menu verifikasi website.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ 
      status: true, 
      message: `Link verifikasi telah dikirim ke ${targetEmail}. Silakan cek kotak masuk/tempmail, salin linknya, lalu tempel di kolom Verify!`,
      email: targetEmail 
    });

  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// 2. ENDPOINT: Verify Magic Link
app.get('/api/alight/verify', validateApiKey, async (req, res) => {
  try {
    let { email, link } = req.query;
    if (!email || !link) {
      return res.status(400).json({ status: false, message: 'Parameter email dan link wajib diisi!' });
    }

    const targetEmail = formatTargetEmail(email);
    const storedCode = pendingVerifications.get(targetEmail);

    if (!storedCode) {
      return res.status(400).json({ status: false, message: 'Tidak ada permintaan verifikasi untuk email ini atau sudah kadaluwarsa!' });
    }

    // Cek apakah link yang ditempel mengandung kode verifikasi yang cocok
    if (link.includes(storedCode)) {
      pendingVerifications.delete(targetEmail);
      return res.json({ 
        status: true, 
        message: `Verifikasi Berhasil! Akun ${targetEmail} resmi aktif Premium Alight Motion!`,
        email: targetEmail
      });
    } else {
      return res.status(400).json({ status: false, message: 'Link verifikasi tidak valid atau tidak cocok!' });
    }

  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// ==================== ENDPOINT ADMIN MANAGEMENT API KEY ==================== //

app.get('/api/admin/keys', validateAdminPin, (req, res) => {
  res.json({ status: true, keys: getApiKeys() });
});

app.post('/api/admin/keys/add', validateAdminPin, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ status: false, message: 'Key tidak boleh kosong!' });

  const keys = getApiKeys();
  if (keys.some(k => k.key === key)) {
    return res.status(400).json({ status: false, message: 'API Key sudah ada!' });
  }

  keys.push({ key, active: true });
  saveApiKeys(keys);
  res.json({ status: true, message: `API Key '${key}' berhasil ditambahkan.` });
});

app.post('/api/admin/keys/toggle', validateAdminPin, (req, res) => {
  const { key, active } = req.body;
  let keys = getApiKeys();

  const target = keys.find(k => k.key === key);
  if (!target) return res.status(404).json({ status: false, message: 'API Key tidak ditemukan!' });

  target.active = active;
  saveApiKeys(keys);
  res.json({ status: true, message: `Status API Key '${key}' diperbarui.` });
});

app.post('/api/admin/keys/delete', validateAdminPin, (req, res) => {
  const { key } = req.body;
  let keys = getApiKeys();

  keys = keys.filter(k => k.key !== key);
  saveApiKeys(keys);
  res.json({ status: true, message: `API Key '${key}' berhasil dihapus.` });
});

app.listen(PORT, () => console.log(`Server aktif pada port ${PORT}`));