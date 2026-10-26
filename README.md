# Trilho Pagamentos

Gateway de pagamentos brasileiro. Stack: Next.js 15 (App Router) + Prisma + Neon Postgres + Vercel.

## Getting Started

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Integrações de Tracking (Best Tracker)

### Meta (Facebook + Instagram) Ads
- OAuth: `GET /api/oauth/meta/connect`
- Callback: `/api/oauth/meta/callback`
- CAPI via tracking-dispatcher.ts (`facebookCAPI`)
- Env: `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`

### TikTok Ads ✅ (aprovado 2026-05-27)
- OAuth: `GET /api/oauth/tiktok/connect` (`?multilogin=1` retorna URL JSON)
- Callback: `/api/oauth/tiktok/callback`
- Sync: `POST /api/oauth/tiktok/sync` — campanhas, adgroups, ads, insights
- Disconnect: `POST /api/oauth/tiktok/disconnect`
- Events API (CAPI): tracking-dispatcher.ts → `tiktokEvents` dispara
  CompletePayment em `business-api.tiktok.com/open_api/v1.3/event/track/`
  com email/phone SHA256 + ttclid
- Env: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`
- Callback URL registrado no TikTok Developer Portal:
  `https://trilhopag.com/api/oauth/tiktok/callback`

### Google Ads
- OAuth: `GET /api/oauth/google/connect`
- Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`

### Kwai Ads
- Manual token entry (sem OAuth público): `POST /api/oauth/kwai/connect`

## Deploy

Auto-deploy via GitHub → Vercel quando push em `main`.

Env vars administradas via:
```bash
VERCEL_TOKEN=<token> vercel env ls --scope=trilho-pag
```
