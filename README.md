# Toko Online Backend

Backend API terpisah untuk storefront IVORY. Repo ini menggunakan NestJS, Prisma, PostgreSQL, JWT dalam cookie HttpOnly, dan mempertahankan bentuk response API lama (`success`, `data`, `error`).

## Development

1. Salin `.env.example` menjadi `.env` dan isi koneksi database serta secret.
2. Jalankan `npm install` di repository backend ini.
3. Jalankan `npm run db:generate`.
4. Jalankan `npm run start:dev`.

API tersedia di `http://localhost:4000/api`. Health check: `GET /api/health`.

Frontend harus memiliki `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. Backend harus memiliki `FRONTEND_URL=http://localhost:3000`; beberapa origin dapat dipisahkan dengan koma. Untuk production, gunakan HTTPS agar cookie sesi `SameSite=None; Secure` dapat dikirim dengan `credentials: include`.

## Endpoint tahap pertama

- `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/session`
- `GET /api/products`, `GET /api/products/:slug`, `GET /api/search`
- `GET|POST /api/cart`, `PATCH|DELETE /api/cart/items/:id`
- `GET|POST /api/wishlist`, `DELETE /api/wishlist/items/:id`

Cart dan wishlist guest tetap berada di localStorage frontend. Endpoint cart/wishlist backend hanya dipanggil setelah login.
