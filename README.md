# Quote API — Vercel

API kecil yang dijual per-call via x402: GET `/quote` = 1 random quote,
$0.001 USDC di Base mainnet. Payout masuk ke wallet OKX owner
(`0x7D5EC74Ff51DaE55205c62048ae6bE66C4DEfD06`), facilitator payai
(mendukung Base mainnet — jangan diganti ke x402.org, itu testnet saja).

## Isi project

- `api/index.js` — satu Serverless Function yang melayani `/`, `/openapi.json`,
  `/.well-known/x402`, dan `/quote` (routing diatur `vercel.json`)
- `vercel.json` — rewrites ke function di atas
- `package.json` — tanpa dependency

## Deploy — cara A: Vercel CLI (paling cepat, perlu Node di komputermu)

```bash
npm i -g vercel
vercel login
cd quote-api-vercel
vercel --prod
```

Ikuti promptnya (pilih scope/Hobby gratis, nama project bebas).
URL hasil deploy bentuknya `https://<nama-project>.vercel.app`.

## Deploy — cara B: GitHub import (lewat website saja)

1. Buat repo baru di GitHub, upload isi folder ini
2. Buka https://vercel.com/new → Import Git Repository → pilih repo itu → Deploy
3. URL hasil deploy bentuknya `https://<nama-project>.vercel.app`

## Setelah deploy

1. Cek `https://<url-kamu>/quote` — harus balik **402** (payment required),
   bukan 404/500
2. Kirim URL itu ke Jett — dia yang jalankan `vapi check` + publish ke vAPI
