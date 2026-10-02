# aar-hub

App sản phẩm của AAR: API NestJS (`apps/api`) và giao diện React + Tailwind (`apps/web`). Monorepo pnpm + Turborepo.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build && pnpm openapi:check
```

Bộ luật, quy trình code, contract với Ops và quyết định kỹ thuật: [`.devkit/`](.devkit/README.md) (agent nạp qua [`AGENTS.md`](AGENTS.md)).

API đang chạy: `GET /api/health` trả `200`, `status: "ok"` và `uptimeSeconds` là số giây tiến trình đã chạy (không âm); `GET /health` trả `404`. Interface: [`apps/api/openapi.json`](apps/api/openapi.json).
