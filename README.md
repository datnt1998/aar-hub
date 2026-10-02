# aar-hub

App sản phẩm của AAR: API NestJS (`apps/api`) và giao diện React + Tailwind (`apps/web`). Monorepo pnpm + Turborepo.

```bash
pnpm install
pnpm verify   # format:check, lint, typecheck, test, e2e, build, openapi:check, db:check
```

Bộ luật, quy trình code, contract với Ops và quyết định kỹ thuật: [`.devkit/`](.devkit/README.md) (agent nạp qua [`AGENTS.md`](AGENTS.md)).

API đang chạy: `GET /api/health` trả `200`, `status: "ok"` và `uptimeSeconds` là số giây tiến trình đã chạy (không âm); `GET /health` trả `404`. Interface: [`apps/api/openapi.json`](apps/api/openapi.json).

Dữ liệu lưu ở PostgreSQL qua Drizzle (`DATABASE_URL`; xem [ADR 0003](.devkit/decisions/0003-postgres-drizzle.md)). Nộp đơn đối tác: một lần `POST /api/partner-applications` (tổ chức) hoặc `POST /api/partner-applications/individual` (cá nhân), multipart/form-data gồm thông tin đơn và các tệp. Tệp của đơn tổ chức được quét mã độc bằng ClamAV (`CLAMAV_HOST`, `CLAMAV_PORT`; xem [ADR 0007](.devkit/decisions/0007-quet-ma-doc-bang-clamav.md)) rồi lưu cùng đơn; tệp của đơn cá nhân hiện chỉ được kiểm, chưa quét và chưa lưu. Chạy local: `docker run -d -p 3310:3310 clamav/clamav-debian` (máy arm64 không có `clamav/clamav`).
