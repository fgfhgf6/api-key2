const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Path File Database Lokal
const DB_KEYS_FILE = path.join(__dirname, 'apikeys.json');
const DB_ADMIN_FILE = path.join(__dirname, 'admin_config.json');

// Get Kode Rahasia Admin (Default: 67678)
function getAdminCode() {
  if (!fs.existsSync(DB_ADMIN_FILE)) {
    const defaultConfig = { code: process.env.ADMIN_PIN || "67678" };
    fs.writeFileSync(DB_ADMIN_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig.code;
  }
  const config = JSON.parse(fs.readFileSync(DB_ADMIN_FILE, 'utf-8'));
  return config.code;
}

// Simpan Kode Rahasia Admin Baru
function saveAdminCode(newCode) {
  fs.writeFileSync(DB_ADMIN_FILE, JSON.stringify({ code: newCode }, null, 2));
}

// Get API Keys
function getApiKeys() {
  if (!fs.existsSync(DB_KEYS_FILE)) {
    // API Key bawaan agar langsung bisa digunakan tanpa buat manual dulu
    const defaultKeys = [{ key: "APIKEY123", active: true }];
    fs.writeFileSync(DB_KEYS_FILE, JSON.stringify(defaultKeys, null, 2));
    return defaultKeys;
  }
  return JSON.parse(fs.readFileSync(DB_KEYS_FILE, 'utf-8'));
}

// Simpan API Keys
function saveApiKeys(keys) {
  fs.writeFileSync(DB_KEYS_FILE, JSON.stringify(keys, null, 2));
}

function formatTargetEmail(inputEmail) {
  let email = inputEmail.trim();
  if (!email.includes('@')) {
    email = `${email}@gmail.com`;
  }
  return email.toLowerCase();
}

// Middleware Validasi API Key User
const validateApiKey = (req, res, next) => {
  const apiKey = req.query.apikey || req.headers['x-api-key'];
  const keys = getApiKeys();
  const foundKey = keys.find(k => k.key === apiKey);

  if (!foundKey) return res.status(401).json({ status: false, message: 'API Key tidak valid!' });
  if (!foundKey.active) return res.status(403).json({ status: false, message: 'API Key sedang non-aktif (Disabled)!' });

  next();
};

// Middleware Validasi Kode Rahasia Admin
const validateAdminCode = (req, res, next) => {
  const code = req.query.code || req.body.code;
  const currentAdminCode = getAdminCode();
  if (code !== currentAdminCode) {
    return res.status(401).json({ status: false, message: 'Kode Rahasia Admin Salah!' });
  }
  next();
};

const pendingVerifications = new Map();

// ==================== ENDPOINT USER ==================== //

app.get('/api/alight/send', validateApiKey, (req, res) => {
  let { email } = req.query;
  if (!email) return res.status(400).json({ status: false, message: 'Email wajib diisi!' });

  const targetEmail = formatTargetEmail(email);
  const verificationCode = "AM-VERIFY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  const mockVerificationLink = `https://alightmotion.com/verify?code=${verificationCode}&email=${encodeURIComponent(targetEmail)}`;

  pendingVerifications.set(targetEmail, verificationCode);

  res.json({
    status: true,
    message: `Link verifikasi berhasil dibuat untuk ${targetEmail}.`,
    email: targetEmail,
    verification_link: mockVerificationLink
  });
});

app.get('/api/alight/verify', validateApiKey, (req, res) => {
  let { email, link } = req.query;
  if (!email || !link) return res.status(400).json({ status: false, message: 'Email dan link wajib diisi!' });

  const targetEmail = formatTargetEmail(email);
  const storedCode = pendingVerifications.get(targetEmail);

  if (!storedCode) return res.status(400).json({ status: false, message: 'Tidak ada verifikasi pending untuk email ini!' });

  if (link.includes(storedCode)) {
    pendingVerifications.delete(targetEmail);
    return res.json({ status: true, message: `Verifikasi Berhasil! Akun ${targetEmail} resmi aktif Premium!`, email: targetEmail });
  } else {
    return res.status(400).json({ status: false, message: 'Link verifikasi tidak valid!' });
  }
});

// ==================== ENDPOINT ADMIN PANEL ==================== //

// Get Daftar API Keys
app.get('/api/admin/keys', validateAdminCode, (req, res) => {
  res.json({ status: true, keys: getApiKeys() });
});

// Tambah API Key Baru
app.post('/api/admin/keys/add', validateAdminCode, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ status: false, message: 'API Key tidak boleh kosong!' });
  
  const keys = getApiKeys();
  if (keys.some(k => k.key === key)) {
    return res.status(400).json({ status: false, message: 'API Key sudah terdaftar!' });
  }
  
  keys.push({ key, active: true });
  saveApiKeys(keys);
  res.json({ status: true, message: `API Key berhasil ditambahkan.` });
});

// Toggle Enable / Disable API Key
app.post('/api/admin/keys/toggle', validateAdminCode, (req, res) => {
  const { key, active } = req.body;
  let keys = getApiKeys();
  const target = keys.find(k => k.key === key);
  
  if (!target) return res.status(404).json({ status: false, message: 'API Key tidak ditemukan!' });
  
  target.active = active;
  saveApiKeys(keys);
  res.json({ status: true, message: `Status API Key diperbarui.` });
});

// Hapus API Key
app.post('/api/admin/keys/delete', validateAdminCode, (req, res) => {
  const { key } = req.body;
  let keys = getApiKeys();
  keys = keys.filter(k => k.key !== key);
  saveApiKeys(keys);
  res.json({ status: true, message: `API Key berhasil dihapus.` });
});

// Ganti Kode Rahasia Admin
app.post('/api/admin/change-code', validateAdminCode, (req, res) => {
  const { new_code } = req.body;
  if (!new_code || new_code.trim().length < 4) {
    return res.status(400).json({ status: false, message: 'Kode rahasia baru minimal 4 karakter!' });
  }
  
  saveAdminCode(new_code.trim());
  res.json({ status: true, message: 'Kode Rahasia Admin berhasil diubah!' });
});

app.listen(PORT, () => console.log(`Server aktif pada port ${PORT}`));
