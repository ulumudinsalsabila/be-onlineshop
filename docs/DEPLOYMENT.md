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
| `EMAIL_PROVIDER` | Ya | Pilih `gmail` atau `resend`. Default aplikasi adalah `gmail`. |
| `GMAIL_USER` | Jika provider Gmail | Alamat Gmail/Google Workspace lengkap. |
| `GMAIL_APP_PASSWORD` | Jika provider Gmail | App Password Google 16 digit; jangan gunakan password akun. |
| `GMAIL_FROM_NAME` | Tidak | Nama pengirim Gmail, default `IVORY`. |
| `RESEND_API_KEY` | Jika provider Resend | API key Resend; simpan hanya di secret manager backend. |
| `EMAIL_FROM` | Jika provider Resend | Pengirim dari domain yang sudah diverifikasi di Resend. |
| `MIDTRANS_SERVER_KEY` | Ya | Server Key Midtrans untuk environment yang dipilih; jangan pernah dikirim ke frontend. |
| `MIDTRANS_IS_PRODUCTION` | Ya | `false` untuk Sandbox, `true` untuk transaksi Production. |
| `MIDTRANS_PAYMENT_EXPIRY_MINUTES` | Tidak | Masa berlaku pembayaran, default `60`, rentang 5–1440 menit. |
| `BITESHIP_IS_PRODUCTION` | Ya | `false` memilih Testing API Key, `true` memilih Live API Key. |
| `BITESHIP_API_KEY_TEST` | Testing | Key berprefix `biteship_test.` dari dashboard Testing Mode. |
| `BITESHIP_API_KEY_LIVE` | Production | Key berprefix `biteship_live.`; Order API production harus sudah aktif. |
| `BITESHIP_WEBHOOK_SECRET` | Ya | Secret acak untuk autentikasi webhook Biteship. |
| `BITESHIP_ORIGIN_*` | Ya | Kontak, alamat lengkap, dan kode pos lokasi pickup. |

Contoh:

```dotenv
NODE_ENV="production"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/ivory_store?sslmode=require"
JWT_SECRET="secret-acak-minimal-32-karakter"
FRONTEND_URL="https://shop.example.com"
BACKEND_PUBLIC_URL="https://api.example.com"
EMAIL_PROVIDER="gmail"
GMAIL_USER="ivory.shop@gmail.com"
GMAIL_APP_PASSWORD="app-password-16-digit"
GMAIL_FROM_NAME="IVORY"
MIDTRANS_SERVER_KEY=""
MIDTRANS_IS_PRODUCTION="false"
MIDTRANS_PAYMENT_EXPIRY_MINUTES="60"
BITESHIP_IS_PRODUCTION="false"
BITESHIP_API_KEY_TEST="biteship_test.xxxxxxxx"
BITESHIP_API_KEY_LIVE=""
BITESHIP_WEBHOOK_SECRET="secret-acak-minimal-32-karakter"
BITESHIP_SHIPPER_NAME="IVORY"
BITESHIP_SHIPPER_PHONE="081234567890"
BITESHIP_SHIPPER_EMAIL="warehouse@example.com"
BITESHIP_SHIPPER_ORGANIZATION="IVORY"
BITESHIP_ORIGIN_CONTACT_NAME="IVORY Warehouse"
BITESHIP_ORIGIN_CONTACT_PHONE="081234567890"
BITESHIP_ORIGIN_CONTACT_EMAIL="warehouse@example.com"
BITESHIP_ORIGIN_ADDRESS="Alamat lengkap warehouse"
BITESHIP_ORIGIN_POSTAL_CODE="12950"
```

Untuk Gmail, aktifkan 2-Step Verification pada akun Google lalu buat App Password khusus aplikasi. SMTP menggunakan `smtp.gmail.com` port `465` dengan TLS. Alamat pengirim selalu mengikuti `GMAIL_USER`; `GMAIL_FROM_NAME` hanya mengubah nama tampilannya.

Untuk tetap memakai Resend, ganti konfigurasi email menjadi:

```dotenv
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_xxxxxxxxx"
EMAIL_FROM="IVORY <noreply@mail.example.com>"
```

Tambahkan domain di dashboard Resend, lalu pasang record SPF dan DKIM yang diberikan. Jika kredensial provider terpilih kosong, development hanya mencetak tautan verifikasi/reset ke log; production menolak start agar kegagalan konfigurasi tidak tersembunyi.

## Midtrans Sandbox dan Production

Backend memakai Snap Redirect dan hanya mempercayai status dari HTTP notification yang signature-nya valid atau Get Status API Midtrans. Tidak ada mock payment. Pilih environment dengan pasangan konfigurasi berikut:

```dotenv
# Development / Sandbox — tidak memotong dana nyata
MIDTRANS_IS_PRODUCTION="false"
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxxxxxx"
MIDTRANS_PAYMENT_EXPIRY_MINUTES="60"
```

```dotenv
# Production — menerima transaksi nyata
MIDTRANS_IS_PRODUCTION="true"
MIDTRANS_SERVER_KEY="Mid-server-xxxxxxxx"
MIDTRANS_PAYMENT_EXPIRY_MINUTES="60"
```

Jangan mencampur Server Key Sandbox dan Production. Setelah backend production memiliki HTTPS publik, atur URL berikut pada Midtrans MAP → Settings → Configuration:

```text
Payment Notification URL: https://api.example.com/api/payments/midtrans/notification
Finish Redirect URL:      https://shop.example.com/checkout/pending
Unfinish Redirect URL:    https://shop.example.com/checkout/pending
Error Redirect URL:       https://shop.example.com/checkout/failed
```

Notification endpoint tidak memakai login karena dipanggil server Midtrans, tetapi setiap payload diverifikasi menggunakan `SHA512(order_id + status_code + gross_amount + ServerKey)`. URL notification tidak boleh localhost; untuk development gunakan tunnel HTTPS menuju port backend lokal. Tombol **Sync Midtrans status** pada frontend memanggil Get Status API sebagai rekonsiliasi jika webhook terlambat.

## Biteship Testing dan Production

Biteship memakai base URL yang sama (`https://api.biteship.com/v1`) untuk kedua mode; API key menentukan apakah request masuk Testing atau Production. Backend menolak start bila prefix key tidak sesuai dengan `BITESHIP_IS_PRODUCTION`, sehingga test key tidak dapat membuat shipment nyata secara tidak sengaja.

```dotenv
# Development / Testing — Order API disimulasikan
BITESHIP_IS_PRODUCTION="false"
BITESHIP_API_KEY_TEST="biteship_test.xxxxxxxx"
BITESHIP_API_KEY_LIVE=""
```

```dotenv
# Production — courier dan pickup nyata
BITESHIP_IS_PRODUCTION="true"
BITESHIP_API_KEY_TEST=""
BITESHIP_API_KEY_LIVE="biteship_live.xxxxxxxx"
```

Di Biteship Dashboard → Integrations, tambahkan webhook berikut dan aktifkan event `order.status`, `order.waybill_id`, dan `order.price`:

```text
https://api.example.com/api/shipments/biteship/webhook
```

Konfigurasikan autentikasi webhook dengan nilai yang sama seperti `BITESHIP_WEBHOOK_SECRET`, baik sebagai header `x-biteship-webhook-secret` atau `Authorization: Bearer <secret>`. Endpoint tidak memakai JWT customer, tetapi menolak payload tanpa secret tersebut.

Tarif checkout diambil dari `POST /v1/rates/couriers`. Setelah Midtrans mengonfirmasi pembayaran `PAID`, backend otomatis membuat Biteship Order. Webhook memperbarui status dan nomor resi di database secara real-time; frontend membaca state backend setiap 15 detik. Tombol **Sync now** memanggil Tracking API sebagai rekonsiliasi manual—hindari polling langsung ke Biteship karena Tracking API dapat dihitung sebagai usage, termasuk pada sandbox.

Sebelum go-live, aktifkan Order API production di dashboard Biteship, pastikan saldo mencukupi, ganti ke live key, dan lakukan satu pengiriman nyata dengan nominal kecil. Testing key membuat order simulasi dan tidak memanggil kurir.

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
