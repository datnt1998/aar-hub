# aar-hub

App sản phẩm của AAR: API NestJS (`apps/api`) và giao diện React + Tailwind (`apps/web`). Monorepo pnpm + Turborepo.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build && pnpm openapi:check
```

Lệnh, luật ticket và contract với Ops: [`AGENTS.md`](AGENTS.md).

API đang chạy: `GET /api/health` trả `200`, `status: "ok"` và `uptimeSeconds` là số giây tiến trình đã chạy (không âm); `GET /health` trả `404`. Interface: [`apps/api/openapi.json`](apps/api/openapi.json).

Dữ liệu lưu ở PostgreSQL qua Drizzle (`DATABASE_URL`; xem mục Database trong `AGENTS.md`). Nộp đơn đối tác tổ chức: tải file bằng `POST /api/partner-applications/attachments`, rồi `POST /api/partner-applications/organization`.
