const express = require('express');
const cors = require('cors');
const path = require('path');
const AlightMotionAuth = require('./alightMotionAuth'); // Pastikan file class scraper ada di folder sama

const app = express();
app.use(cors());
app.use(express.json());

// Menjalankan file statis dari folder 'public' (untuk index.html)
app.use(express.static(path.join(__dirname, 'public')));

// DATABASE SEMENTARA DI MEMORI
let apiKeysDatabase = [
    { key_value: "Maskay", ordername: "Maskay-212121" }
];

// ================= MIDDLEWARE CEK API KEY USER =================
function checkUserApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) return res.status(401).json({ success: false, error: "API Key diperlukan!" });

    const found = apiKeysDatabase.find(k => k.key_value === apiKey);
    if (!found) {
        return res.status(403).json({ success: false, error: "API Key tidak valid!" });
    }

    req.ordername = found.ordername;
    next();
}

// ================= REST API UNTUK SCRAPER =================
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
    
    // 🔥 DYNAMIC OVERRIDE ORDER ID SESUAI MILIK API KEY TERSEBUT
    auth.ORDER_ID = req.ordername; 
    console.log(`[EXEC] Email: ${email} | Active Order ID: ${auth.ORDER_ID}`);

    const verifyResult = await auth.verifyAndFetchProfile(email, rawLink);
    if (!verifyResult.success) return res.status(400).json(verifyResult);

    const premiumResult = await auth.applyPremium(verifyResult.idToken);
    res.json(premiumResult);
});

// ================= API ADMIN (DENGAN KUNCI 6767) =================
app.get('/api/admin/keys', (req, res) => {
    res.json(apiKeysDatabase);
});

app.post('/api/admin/keys', (req, res) => {
    const { admin_key, key_value, ordername } = req.body;

    // 🔒 VALIDASI ADMIN KEY HARUS 6767
    if (admin_key !== "6767") {
        return res.status(403).json({ success: false, error: "Admin Key salah! Akses ditolak." });
    }

    if (!key_value || !ordername) {
        return res.status(400).json({ success: false, error: "API Key dan Custom Order ID wajib diisi!" });
    }

    if (apiKeysDatabase.some(k => k.key_value === key_value)) {
        return res.status(400).json({ success: false, error: "API Key sudah terdaftar!" });
    }

    apiKeysDatabase.push({ key_value, ordername });
    res.json({ success: true, message: "API Key baru berhasil ditambahkan!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server aktif di port ${PORT}`));
