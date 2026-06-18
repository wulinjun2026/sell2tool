# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

通用产品销售助手 (General Product Sales Assistant) — a SaaS tool for small merchants to create marketing posters: structured photo upload → AI copywriting → poster generation → save/share. Web H5 + PWA + Capacitor Android.

## Servers

| Server | IP | Purpose | Access |
|--------|-----|---------|--------|
| 测试服务器 | 106.12.40.212 | 功能测试、UI验证 | `ssh root@106.12.40.212` (密码: Wulinjun@2) |
| 构建服务器 | 106.12.86.64 | 打包构建、node_modules编译 | 用于 `npm run pack` 远程构建 |

部署命令：`rsync -avz public/ server/ assets/ root@106.12.40.212:/opt/used-car-assistant/`

## Key Commands

```bash
# Start server (port 3000)
npm start

# Run all tests (server must be running first)
npm test

# Run single test
node tests/auth-user-test.js

# Pack for production deployment
npm run pack

# Initialize database
npm run init-db

# Android APK build
npm run android:build
```

## Architecture

### Backend (Express + Node.js 18+)

- Entry: `server/index.js` — routes, Multer upload, static serving, error handling
- Database: `server/db.js` — SQLite (local) / MySQL (production) adapter + migrations 001-004
- Services: `server/services/` — domain logic (auth, vehicle, poster, AI, etc.)

Key services:
| File | Purpose |
|------|---------|
| `authService.js` | SMS verification, JWT, `requireAuth` middleware |
| `vehicleRepository.js` | CRUD, filtering, batch ops; **filters by `user_id`** |
| `posterRender.js` | Build SVG poster (compose only, **no server PNG**) |
| `copyPolish.js` | AI copywriting with queue + local fallback |
| `aiRequestQueue.js` | Concurrency limit, queue, timeout for AI requests |

### Frontend (Native ES Modules, no framework)

- Entry: `public/index.html` + `public/js/app.js`
- Auth: `public/js/auth.js` — JWT localStorage
- Poster: `public/js/posterRenderClient.js` → `posterImageEmbedClient.js` → `posterExportClient.js` (client-side PNG rasterization)
- Cache: `public/js/posterCache.js`, `public/js/galleryStore.js` — IndexedDB
- Upload: `public/js/photoCompressClient.js` — client-side compression before upload

### Poster Generation Pipeline (v1.1)

Two-phase design to reduce server load:
1. **Server compose** (`/api/posters/compose`): returns SVG document + embed parameters
2. **Client rasterize**: embed images → Canvas → PNG Blob

Progress mapping in `posterProgress.js`: compose (8-25%), embed (28-82%), rasterize (85-96%), finalize (98-99.9%).

### Data Isolation (Multi-tenant)

- All business queries filter by `user_id` from JWT
- Trial: 20 days, max 40 products; `plan=paid` unlocks unlimited
- Uploads stored in `data/uploads/vehicles/{vehicleId}/`

## Database

- Schema v4 with migrations in `server/migrations/`
- Tables: users, auth_codes, vehicles, vehicle_photos, dealer_profile, poster_generations, analytics_events
- DDL docs: `docs/数据库DDL.md`

## Environment Variables

See `.env.example`. Key variables:
| Variable | Purpose |
|----------|---------|
| `DB_DRIVER` | `sqlite` (local) / `mysql` (production) |
| `AUTH_SECRET` | JWT signing key (change in production) |
| `AUTH_DEV_MODE` | Returns verification code in API response for testing |
| `VISION_API_*` | DeepSeek/OpenAI-compatible API for copywriting |
| `PUBLIC_BASE_URL` | Public URL for resource paths |

## API Endpoints

Health check: `GET /api/health`
Auth: `POST /api/auth/sms/send`, `POST /api/auth/sms/verify`
Business (JWT required): `/api/vehicles*`, `/api/posters/compose`, `/api/dealer*`

Full API spec: `docs/API设计.md`

## Testing Notes

- Tests require server running (`npm start` first)
- Tests are Node scripts, not Jest/Mocha
- Development mode (`AUTH_DEV_MODE=true`) returns SMS code in `devCode` field

## Important Patterns

- Server never generates PNG files — only SVG compose; client handles rasterization
- AI requests go through `aiRequestQueue.js` with concurrency/queue limits
- Client compresses images before upload via `photoCompressClient.js`
- Poster templates are JSON files in `assets/templates/` (layoutSchema spec in `docs/长图layoutSchema规范.md`)

## Code Terminology

- UI displays "产品" (product); backend uses legacy `vehicle` naming for compatibility
- Poster status: `draft` → `on_sale` → `sold`
- Product ID format: `CCyyyyMMddHHmmNNN`