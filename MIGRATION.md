# Migration status

The split is intentionally staged so the live storefront remains deployable after every step.

## Moved to backend repository

- Prisma schema and complete migration history
- NestJS runtime, CORS/origin protection, health check, and production container
- JWT-cookie authentication foundation
- Public products, product detail, search, category, brand, featured, related, and home data
- Authenticated cart and wishlist endpoints

## Connected from frontend

- Central `lib/backend-api.ts` client
- Server-rendered storefront product data when `NEXT_PUBLIC_API_URL` is configured
- Client search overlay
- Guest cart and wishlist remain local and never require authentication

## Still using legacy frontend server routes

- Auth.js session and email verification/recovery
- Account profile, addresses, orders, returns, and security
- Checkout, shipping, payments, and Midtrans webhook
- Admin and seller dashboards

Those areas must move before Prisma, Auth.js, `app/api`, and server-only domain modules can be removed from the frontend repository. Do not delete the legacy routes before their replacement endpoints and authorization tests exist.
