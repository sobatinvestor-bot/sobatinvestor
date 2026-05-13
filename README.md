# Sobat Investor 🌱

> Asisten AI untuk Investor Saham Indonesia.
> Powered by React + Cloudflare Pages + Claude API.

![Status](https://img.shields.io/badge/status-ready_to_deploy-success)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Fitur

- 🏠 **Beranda** — Landing page dengan live ticker IHSG
- 📊 **Dashboard** — Portfolio analytics dengan chart real-time (Recharts)
- ✨ **Sobat AI Chat** — AI agent terhubung ke Claude untuk analisis saham
- 💼 **Portfolio** — Holdings table dengan export CSV untuk Excel

## 🛠️ Tech Stack

- **Frontend:** React 18 + Vite
- **Charts:** Recharts
- **Icons:** Lucide React
- **AI:** Anthropic Claude (Sonnet 4)
- **Hosting:** Cloudflare Pages (gratis)
- **API Proxy:** Cloudflare Pages Functions
- **Fonts:** Fraunces + Plus Jakarta Sans + JetBrains Mono

---

## 🚀 Cara Deploy ke Production

### Langkah 1: Beli Domain di Cloudflare

1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) → sign up (gratis)
2. Pilih menu **"Domain Registration"** di sidebar
3. Search `sobatinvestor.com` (atau alternatif kalau sudah taken)
4. Checkout (~$10-11/tahun, pakai kartu kredit/debit yang support USD)

### Langkah 2: Setup Repository GitHub

```bash
# Di komputer kamu:
cd sobatinvestor
git init
git add .
git commit -m "Initial commit: Sobat Investor MVP"

# Buat repo baru di github.com, lalu:
git remote add origin https://github.com/USERNAME/sobatinvestor.git
git branch -M main
git push -u origin main
```

### Langkah 3: Get Anthropic API Key

1. Daftar di [console.anthropic.com](https://console.anthropic.com)
2. **Settings** → **API Keys** → **Create Key**
3. Top up credit (~$5-10 untuk testing)
4. Salin API key (`sk-ant-api03-...`)

### Langkah 4: Deploy ke Cloudflare Pages

1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Klik **"Create"** → **"Pages"** → **"Connect to Git"**
3. Pilih repo `sobatinvestor` yang tadi di-push
4. Build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. **Environment variables** → tambahkan:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-xxxxx` (API key dari langkah 3)
6. Klik **"Save and Deploy"**

Tunggu ~2 menit, app akan live di `https://sobatinvestor.pages.dev`

### Langkah 5: Connect Custom Domain

1. Di project Pages → **Custom domains** → **Set up a custom domain**
2. Ketik `sobatinvestor.com`
3. Karena domain sudah di Cloudflare, DNS auto-config
4. Tunggu ~1-2 menit untuk SSL otomatis aktif
5. ✅ Done! `https://sobatinvestor.com` udah live

---

## 💻 Development Lokal

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Edit .env, isi ANTHROPIC_API_KEY

# Jalankan dev server
npm run dev
# → http://localhost:5173

# Build untuk production
npm run build
```

**Catatan untuk dev lokal:**
Pages Functions (`/api/chat`) tidak jalan di `vite dev` biasa.
Untuk test full stack lokal, install Wrangler:

```bash
npm install -g wrangler
npm run build
wrangler pages dev dist --compatibility-date=2025-01-01
```

Lalu set env var:
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars
```

---

## 📁 Struktur Project

```
sobatinvestor/
├── src/
│   ├── App.jsx          # Main app component
│   ├── main.jsx         # React entry
│   └── index.css        # Global styles
├── functions/
│   └── api/
│       └── chat.js      # Cloudflare Function (proxy ke Claude API)
├── public/
│   └── favicon.svg
├── index.html           # HTML entry + SEO meta
├── package.json
├── vite.config.js
├── wrangler.toml        # Cloudflare config
├── .env.example
└── README.md
```

---

## 💰 Estimasi Biaya Bulanan

| Item                   | Biaya              | Catatan                     |
| ---------------------- | ------------------ | --------------------------- |
| Domain `.com`          | ~Rp 14rb/bulan     | (Rp 170rb/tahun)            |
| Cloudflare Pages       | **Gratis**         | 500 build/bulan, ∞ bandwidth |
| SSL/CDN/DDoS           | **Gratis**         | Built-in                    |
| Anthropic API          | ~Rp 80-150rb/bulan | Tergantung pemakaian        |
| **TOTAL**              | **~Rp 100-200rb**  | Untuk MVP dengan 1000 chat  |

---

## 🔐 Keamanan

- ✅ API key Anthropic **TIDAK** pernah masuk ke browser/client
- ✅ Semua request ke Claude di-proxy lewat Cloudflare Function
- ✅ Rate limiting basic di Function level (max 50 messages per conversation)
- ✅ HTTPS otomatis dari Cloudflare
- ⚠️ TODO: Tambah autentikasi user untuk production (saat ini siapapun bisa chat)
- ⚠️ TODO: Tambah rate limiting per IP

---

## 🗺️ Roadmap

- [ ] User auth (Cloudflare Access / Clerk / Supabase)
- [ ] Real IDX data integration (yfinance via Python backend / Stockbit API)
- [ ] Save chat history per user
- [ ] Real portfolio sync dari Stockbit/Ajaib/IPOT
- [ ] Excel export dengan formula (pakai exceljs)
- [ ] Push notification untuk alert harga
- [ ] Dividend calendar
- [ ] Backtest strategy

---

## ⚠️ Disclaimer

Aplikasi ini adalah **demo / MVP** untuk tujuan edukasi.
Bukan saran finansial profesional. Data saham yang ditampilkan adalah **simulasi**.
Investasi saham mengandung risiko — keputusan investasi sepenuhnya tanggung jawab pengguna.

---

## 📝 License

MIT © 2026 Sobat Investor
