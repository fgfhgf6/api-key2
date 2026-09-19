const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const AlightMotionAuth = require('./alightMotionAuth'); // Pastikan file class scraper ada di folder yang sama

const app = express();
app.use(cors());
app.use(express.json());

// Melayani file statis dari folder 'public' (untuk index.html)
app.use(express.static(path.join(__dirname, 'public')));

const KEYS_FILE = path.join(__dirname, 'keys.json');

// Fungsi helper membaca keys.json
function getKeysData() {
    try {
        if (!fs.existsSync(KEYS_FILE)) {
            const defaultData = [
                { key_value: "Maskay", ordername: "Maskay-98567" }
            ];
            fs.writeFileSync(KEYS_FILE, JSON.stringify(defaultData, null, 2));
        }
        const data = fs.readFileSync(KEYS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

// Fungsi helper menyimpan keys.json
function saveKeysData(data) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

// ================= MIDDLEWARE CEK API KEY USER =================
function checkUserApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return res.status(401).json({ success: false, error: "API Key diperlukan!" });

    const keys = getKeysData();
    const found = keys.find(k => k.key_value === apiKey);
    
    if (!found) {
        return res.status(403).json({ success: false, error: "API Key tidak valid!" });
    }

    req.ordername = found.ordername;
    next();
}

// ================= REST API SCRAPER ALIGHT MOTION =================
app.post('/api/am/send-link', checkUserApiKey, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email wajib diisi!" });
    
    const auth = new AlightMotionAuth();
    const result = await auth.sendMagicLink(email);
    res.json(result);
});

app.post('/api/am/verify', checkUserApiKey, async (req, res) => {
    const { email, rawLink } = req.body;
    if (!email || !rawLink) return res.status(400).json({ success: false, error: "Email dan link wajib diisi!" });

    const auth = new AlightMotionAuth();
    
    // 🔥 DYNAMIC OVERRIDE ORDER ID SESUAI MILIK API KEY
    auth.ORDER_ID = req.ordername; 
    console.log(`[EXEC] Email: ${email} | Active Order ID: ${auth.ORDER_ID}`);

    const verifyResult = await auth.verifyAndFetchProfile(email, rawLink);
    if (!verifyResult.success) return res.status(400).json(verifyResult);

    const premiumResult = await auth.applyPremium(verifyResult.idToken);
    res.json(premiumResult);
});

// ================= API ADMIN PANEL (KUNCI: 6767) =================

// 1. Ambil Semua Daftar API Key
app.get('/api/admin/keys', (req, res) => {
    res.json(getKeysData());
});

// 2. Tambah API Key Baru
app.post('/api/admin/keys', (req, res) => {
    const { admin_key, key_value, ordername } = req.body;

    if (admin_key !== "676789") {
        return res.status(403).json({ success: false, error: "Admin Key salah! Akses ditolak." });
    }

    if (!key_value || !ordername) {
        return res.status(400).json({ success: false, error: "API Key dan Custom Order ID wajib diisi!" });
    }

    const keys = getKeysData();
    if (keys.some(k => k.key_value === key_value)) {
        return res.status(400).json({ success: false, error: "API Key sudah terdaftar!" });
    }

    keys.push({ key_value, ordername });
    saveKeysData(keys);

    res.json({ success: true, message: "API Key berhasil ditambahkan!" });
});

// 3. Hapus (Delete) API Key
app.delete('/api/admin/keys', (req, res) => {
    const { admin_key, key_value } = req.body;

    if (admin_key !== "6767") {
        return res.status(403).json({ success: false, error: "Admin Key salah! Akses ditolak." });
    }

    if (!key_value) {
        return res.status(400).json({ success: false, error: "API Key yang akan dihapus wajib diisi!" });
    }

    let keys = getKeysData();
    const initialLength = keys.length;
    
    keys = keys.filter(k => k.key_value !== key_value);

    if (keys.length === initialLength) {
        return res.status(404).json({ success: false, error: "API Key tidak ditemukan di database!" });
    }

    saveKeysData(keys);
    res.json({ success: true, message: `API Key '${key_value}' berhasil dihapus!` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server aktif di port ${PORT}`);
});
