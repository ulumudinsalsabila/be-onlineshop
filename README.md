# Toko Online Backend

Panduan deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Backend API terpisah untuk storefront IVORY. Repo ini menggunakan NestJS, Prisma, PostgreSQL, JWT dalam cookie HttpOnly, dan mempertahankan bentuk response API lama (`success`, `data`, `error`).

Endpoint login juga mengembalikan `data.accessToken`. Semua endpoint terlindungi menerima `Authorization: Bearer <JWT>`; cookie `ivory_session` tetap didukung sebagai fallback untuk kompatibilitas.

## Development

1. Salin `.env.example` menjadi `.env` dan isi koneksi database serta secret.
2. Jalankan `npm install` di repository backend ini.
3. Jalankan `npm run db:generate`.
4. Jalankan `npm run start:dev`.

API tersedia di `http://localhost:4000/api`. Health check: `GET /api/health`.

Swagger UI tersedia di `http://localhost:4000/api/docs` dan dokumen OpenAPI JSON di `http://localhost:4000/api/docs-json`. Set `SWAGGER_ENABLED="false"` untuk menonaktifkan keduanya, misalnya pada production yang tidak memerlukan dokumentasi publik.

Frontend harus memiliki `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. Backend harus memiliki `FRONTEND_URL=http://localhost:3000`; beberapa origin dapat dipisahkan dengan koma. Untuk production, gunakan HTTPS agar cookie sesi `SameSite=None; Secure` dapat dikirim dengan `credentials: include`.

Konfigurasi Auth.js lama tidak dipakai oleh backend NestJS. Gunakan `JWT_SECRET` sebagai pengganti `AUTH_SECRET`, `FRONTEND_URL` sebagai pengganti `AUTH_URL`/`NEXT_PUBLIC_APP_URL`, dan `BACKEND_PUBLIC_URL` untuk URL publik API. Variable `NEXT_PUBLIC_*` tetap hanya berada di repository frontend.

Pengiriman email mendukung dua provider. Atur `EMAIL_PROVIDER="gmail"` untuk Gmail SMTP dengan `GMAIL_USER` dan `GMAIL_APP_PASSWORD`, atau `EMAIL_PROVIDER="resend"` dengan `RESEND_API_KEY` dan `EMAIL_FROM`. Gmail wajib memakai App Password, bukan password login akun.

Payment menggunakan Midtrans Snap. Gunakan `MIDTRANS_IS_PRODUCTION="false"` dengan Sandbox Server Key untuk development dan ubah ke `true` hanya bersama Production Server Key. Webhook publiknya adalah `POST /api/payments/midtrans/notification`; status customer dapat direkonsiliasi lewat `POST /api/payments/:orderId/sync`.

Untuk request API langsung pada production, gunakan custom domain dengan induk yang sama, misalnya `shop.example.com` dan `api.example.com`, lalu set `COOKIE_DOMAIN=".example.com"`. Biarkan kosong saat frontend dan backend lokal sama-sama memakai hostname `localhost`. Domain acak `*.vercel.app` dari dua project berbeda tidak dapat berbagi cookie sesi dengan Server Components.

## Endpoint tahap pertama

- `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/session`
- `GET /api/products`, `GET /api/products/:slug`, `GET /api/search`
- `GET|POST /api/cart`, `PATCH|DELETE /api/cart/items/:id`
- `GET|POST /api/wishlist`, `DELETE /api/wishlist/items/:id`

Cart dan wishlist guest tetap berada di localStorage frontend. Endpoint cart/wishlist backend hanya dipanggil setelah login.
