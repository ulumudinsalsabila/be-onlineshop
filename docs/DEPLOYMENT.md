# Deployment `be-onlineshop`

Panduan ini khusus untuk API NestJS. Frontend Next.js dideploy terpisah dari repository `fe-onlineshop`.

## Arsitektur produksi

- Runtime: Node.js 22
- Database: PostgreSQL dengan TLS
- API prefix: `/api`
- Health check: `GET /api/health`
- Port default: `4000`; gunakan nilai `PORT` dari platform jika disediakan

Domain yang disarankan:

```text
API:      https://api.example.com
Frontend: https://shop.example.com
```

Memakai subdomain dari domain utama yang sama membantu kompatibilitas cookie. Production wajib HTTPS karena cookie sesi menggunakan `Secure` dan `SameSite=None`.

## Environment variable

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `NODE_ENV` | Ya | Gunakan `production`. Biasanya diatur platform. |
| `PORT` | Tergantung platform | Jangan dipatok pada platform yang memberikan port secara dinamis. |
| `DATABASE_URL` | Ya | PostgreSQL production; aktifkan TLS dan pooling sesuai penyedia. |
| `JWT_SECRET` | Ya | Secret acak minimal 32 karakter. |
| `FRONTEND_URL` | Ya | Origin frontend tanpa trailing slash. Beberapa origin dapat dipisahkan koma. |
| `BACKEND_PUBLIC_URL` | Production upload | URL publik API, misalnya `https://api.example.com`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Jika SMTP aktif | Untuk Gmail gunakan `smtp.gmail.com`, `465`, dan `true`. |
| `SMTP_USER`, `SMTP_PASS` | Jika SMTP aktif | Alamat Gmail dan Google App Password. Jangan gunakan password login akun. |
| `RESEND_API_KEY` | Opsional | Fallback Resend jika SMTP tidak dikonfigurasi. |
| `EMAIL_FROM` | Jika email aktif | Pengirim dari domain yang sudah diverifikasi. |
| `MIDTRANS_SERVER_KEY` | Jika Midtrans aktif | Secret server Midtrans; jangan pernah dikirim ke frontend. |

Contoh:

```dotenv
NODE_ENV="production"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/ivory_store?sslmode=require"
JWT_SECRET="secret-acak-minimal-32-karakter"
FRONTEND_URL="https://shop.example.com"
BACKEND_PUBLIC_URL="https://api.example.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER=""
SMTP_PASS=""
RESEND_API_KEY=""
EMAIL_FROM="IVORY <noreply@example.com>"
MIDTRANS_SERVER_KEY=""
```

Untuk testing sementara dengan Gmail, aktifkan 2-Step Verification lalu buat App Password 16 karakter. Jika `SMTP_USER` dan `SMTP_PASS` terisi, backend memprioritaskan SMTP; jika kosong, backend memakai Resend. Gmail cocok untuk testing dengan volume rendah, bukan pengiriman production berskala besar.

`FRONTEND_URL` diperiksa secara exact untuk mutation request. Jangan memasukkan path atau trailing slash. Untuk staging:

```dotenv
FRONTEND_URL="https://shop.example.com,https://staging-shop.example.com"
```

## Quality gate

Jalankan sebelum membuat release:

```bash
npm ci
npm run lint
npm run type-check
npm run build
```

## Migration database

Migration tidak boleh dijalankan dari setiap instance aplikasi. Jalankan satu kali sebagai release job sebelum versi baru menerima traffic:

```bash
npm ci
npm run db:migrate:deploy
```

Gunakan direct database URL untuk migration apabila penyedia membedakan URL direct dan pooled. Jangan menjalankan seed development pada production. Backup database sebelum migration yang destruktif.

## Deploy dengan Docker

Build image dari root backend:

```bash
docker build -t ivory-api:latest .
```

Jalankan migration dari checkout source atau job CI yang memiliki dev dependency Prisma, lalu jalankan container:

```bash
docker run --rm -p 4000:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DATABASE_URL='postgresql://...' \
  -e JWT_SECRET='...' \
  -e FRONTEND_URL='https://shop.example.com' \
  -e BACKEND_PUBLIC_URL='https://api.example.com' \
  ivory-api:latest
```

Pasang reverse proxy/load balancer HTTPS di depan container. Health probe:

```text
GET https://api.example.com/api/health
```

Response sehat:

```json
{"success":true,"data":{"status":"ok","service":"toko-online-backend"}}
```

## Deploy ke VPS tanpa Docker

```bash
npm ci
npm run db:migrate:deploy
npm run build
NODE_ENV=production npm start
```

Jalankan proses dengan systemd atau process manager. Reverse proxy harus meneruskan `Host`, `X-Forwarded-For`, dan `X-Forwarded-Proto`.

## Deploy ke Railway, Render, atau layanan container

Gunakan konfigurasi berikut:

```text
Build command: npm ci && npm run build
Start command: npm start
Health path:   /api/health
Node:          22.x
```

Jalankan `npm run db:migrate:deploy` sebagai pre-deploy/release command terpisah. Isi seluruh environment variable melalui secret manager platform.

## Penyimpanan upload

Endpoint seller saat ini dapat menulis ke `public/uploads`. Penyimpanan lokal ini hanya aman pada satu VPS dengan disk persisten. Filesystem container/serverless umumnya sementara dan beberapa replica tidak berbagi file.

Sebelum memakai beberapa instance atau platform ephemeral, pindahkan upload ke object storage/Cloudinary. Jika masih memakai disk persisten, mount direktori berikut:

```text
/app/public/uploads
```

## Urutan deployment

1. Siapkan PostgreSQL, backup, domain API, dan HTTPS.
2. Isi secret backend.
3. Jalankan migration production satu kali.
4. Deploy backend.
5. Pastikan `/api/health` dan `/api/products` berhasil.
6. Deploy frontend dengan `NEXT_PUBLIC_API_URL` yang menunjuk API ini.
7. Jalankan smoke test auth, cart, checkout, account, admin, dan seller.

Deploy backend lebih dahulu untuk perubahan kontrak API. Pertahankan backward compatibility sampai frontend baru aktif.

## Smoke test

```bash
curl https://api.example.com/api/health
curl https://api.example.com/api/products
```

Periksa juga:

- mutation dari origin yang tidak terdaftar mendapat `403 INVALID_ORIGIN`;
- login mengirim cookie `ivory_session` dengan atribut production;
- user tidak dapat membaca resource milik user lain;
- role customer ditolak dari endpoint admin;
- secret tidak muncul pada response atau log;
- koneksi database, email, payment, dan upload terpantau.

## Rollback

Rollback image/release aplikasi secara independen. Jangan membatalkan migration secara otomatis. Bila kontrak API tidak backward-compatible, rollback backend dan frontend sebagai pasangan, lalu ulangi health check dan smoke test transaksi.

## Referensi platform

- [Railway pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway deployment configuration](https://docs.railway.com/config-as-code/reference)
- [Prisma production migration](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
