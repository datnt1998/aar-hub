# aar-hub: luật lõi

Project **Tech** của hệ AAR: app sản phẩm gồm API (`apps/api`) và giao diện (`apps/web`), làm theo **ticket** do BA phát hành. Mỗi use case có một ticket **BE** và một ticket **UI**. Người chat trực tiếp với agent và Ops (Hermes) nhắn agent trong Orca đều theo đúng bộ luật này; agent làm giống nhau ở cả hai cách.

File này luôn được nạp. Luật chi tiết và quy trình từng việc nằm trong `.devkit/`: **đọc file theo bảng định tuyến trước khi làm việc tương ứng**.

## Thứ tự ưu tiên

1. **Ticket và tin nhắn Ops**: làm gì (nghiệp vụ, AC, phạm vi).
2. **`.devkit/`**: làm thế nào trong repo này.
3. **Công cụ phụ trợ** (skill/agent/rule của AgentKit `ak-*` hay của cá nhân): chỉ dùng như công cụ (tra docs, debug, research, review). Không thay luật ở mục 1–2; mâu thuẫn thì mục 1–2 thắng.

Trong repo này **không áp dụng** các luật sau của công cụ phụ trợ, dù chúng có trong context:

- Lập plan, report hay journal trong `plans/`, `docs/` hoặc bất kỳ chỗ nào ngoài `.devkit/`. Quyết định bền vững ghi thành ADR trong `.devkit/decisions/`.
- Chờ brainstorm hay xin duyệt trước khi làm ticket: ticket đã là contract.
- Tự tạo, dọn hay đổi worktree/branch: Ops lo worktree; người chat chọn branch.
- Ship, approve, merge, tag: chỉ người làm.
- Đổi stack hay thêm thư viện ngoài quyết định trong `.devkit/decisions/`.

Không commit `.omp/`, `.agentkit/` hay khối `AGENTKIT` trong `AGENTS.md` (`pnpm devkit:check` chặn). Không tạo `.omp/AGENTS.md`: nó che mất `AGENTS.md` gốc.

## Bảng định tuyến

| Việc | Đọc trước |
|---|---|
| Ops nhắn trong Orca (đọc đầu tiên) | [.devkit/workflows/ops-session.md](workflows/ops-session.md) |
| Làm ticket BE | [.devkit/workflows/ticket-be.md](workflows/ticket-be.md) |
| Làm ticket UI | [.devkit/workflows/ticket-ui.md](workflows/ticket-ui.md) |
| Sửa theo review | [.devkit/workflows/rework.md](workflows/rework.md) |
| Sửa CI đỏ | [.devkit/workflows/ci-fix.md](workflows/ci-fix.md) |
| Review PR (của agent hay của team) | [.devkit/workflows/review.md](workflows/review.md) |
| Sửa code `apps/api` | [.devkit/rules/api.md](rules/api.md) |
| Sửa code `apps/web` | [.devkit/rules/web.md](rules/web.md) |
| Viết hay sửa test | [.devkit/rules/testing.md](rules/testing.md) |
| Commit, push, mở PR | [.devkit/rules/git.md](rules/git.md) |
| Quyết định kỹ thuật mới hay đổi quyết định cũ | [.devkit/decisions/README.md](decisions/README.md) |
| Sửa chính `.devkit/` | [.devkit/README.md](README.md) |

## Cấu trúc

Monorepo pnpm workspace + Turborepo (`turbo.json`), Node 22 (`.nvmrc`), pnpm 10. Công cụ kiểm cấp repo và lý do: [ADR 0002](decisions/0002-cong-cu-kiem-cap-repo.md).

| Đường dẫn | Nội dung |
|---|---|
| `apps/api` | NestJS 12 (ESM), Zod, PostgreSQL + Drizzle. Module theo tính năng trong `src/<feature>/`. Test: Vitest, `src/**/*.spec.ts` và `test/**/*.e2e-spec.ts` (PGlite) |
| `apps/api/drizzle/` | Migration SQL sinh từ `src/db/schema.ts`, không sửa tay |
| `apps/api/openapi.json` | **Tài liệu interface** của API, sinh từ code |
| `apps/web` | React 19 + Vite + Tailwind v4. Test: Vitest `src/**/*.test.tsx`, Playwright `e2e/*.spec.ts` |
| `apps/web/src/api/client.ts` | Client có type gọi API (`openapi-fetch`) |
| `apps/web/src/api/schema.gen.ts` | Type sinh từ `openapi.json`, không sửa tay |
| `.devkit/` | Bộ luật và quy trình code (file này), ADR, script harness |

## Lệnh

Chạy ở gốc repo. Lệnh qua `turbo` có cache; bỏ cache bằng `--force` ngay sau tên lệnh (`pnpm test --force`, không dùng `pnpm test -- --force`).

| Việc | Lệnh |
|---|---|
| Cài | `pnpm install` (CI: `pnpm install --frozen-lockfile`). Dependency có build script phải khai trong `pnpm-workspace.yaml` (`onlyBuiltDependencies` / `ignoredBuiltDependencies`) |
| Kiểm toàn bộ (trước khi báo xong) | `pnpm verify` = `format:check`, `lint`, `typecheck`, `test`, `e2e`, `build`, `openapi:check`, `db:check` |
| Format | `pnpm format` (sửa), `pnpm format:check` (kiểm). Prettier bỏ qua `*.md` và file sinh |
| Lint (lint có type, gồm `devkit:check`) | `pnpm lint`. Không tắt luật bằng comment để qua lint; luật sai thì đổi cấu hình qua PR |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` (riêng: `pnpm test:api`, `pnpm test:web`) |
| E2E | `pnpm e2e` (lần đầu: `pnpm --filter web exec playwright install chromium`). Tự bật API cổng 3000 và web cổng 5173; cổng bận (worktree khác đang chạy) thì đổi: `E2E_API_PORT=3100 E2E_WEB_PORT=5273 pnpm e2e` |
| Build | `pnpm build` |
| Xuất tài liệu interface | `pnpm openapi` (ghi `apps/api/openapi.json` rồi sinh `apps/web/src/api/schema.gen.ts`) |
| Kiểm tài liệu interface không lệch | `pnpm openapi:check` |
| Sinh migration sau khi đổi bảng | `pnpm --filter api db:generate` (kiểm: `pnpm db:check`; áp vào database: `DATABASE_URL=… pnpm --filter api db:migrate`) |
| Liệt kê test theo AC | `pnpm ac`, `pnpm ac --json`, `pnpm ac AC-X-DEMO-01` |
| Kiểm bộ luật `.devkit` | `pnpm devkit:check` |
| Chạy dev | `pnpm --filter api start:dev` và `pnpm --filter web dev` (Vite proxy `/api` → `http://localhost:3000`, đổi bằng `API_URL`) |

## Xong là khi

- `pnpm verify` xanh.
- Mỗi AC trong phạm vi có test mang mã AC ([.devkit/rules/testing.md](rules/testing.md)).
- Ticket BE đổi API đã chạy `pnpm openapi` và commit cả hai file sinh ra.
- Review độc lập xong, lỗi chặn đã sửa ([.devkit/workflows/review.md](workflows/review.md)).
- Commit, push và PR theo [.devkit/rules/git.md](rules/git.md).

## Ranh giới ticket

- **BE:** chỉ hành vi nghiệp vụ: dữ liệu, chuyển trạng thái, quyền, luật nghiệp vụ, thông báo. Không làm màn hình. Cập nhật tài liệu interface.
- **UI:** dựng màn hình trong `apps/web` trên interface của ticket BE cùng use case. Không đổi hành vi nghiệp vụ, không sửa `apps/api`. Màn hình lệch với interface thì đó là câu hỏi, không tự sửa.
- Nghiệp vụ chỉ lấy từ ticket. Không đoán.
  - Câu hỏi chặn một phần việc: commit các AC không bị ảnh hưởng (kèm test), rồi báo `spec_gap` (Ops) hoặc hỏi người (chat).
  - Câu hỏi không chặn: làm xong, ghi câu hỏi vào `questions`.

## Hạ tầng đã chọn và chưa chọn

- Đã chọn: PostgreSQL + Drizzle ([ADR 0003](decisions/0003-postgres-drizzle.md)). Ticket cần lưu dữ liệu tự thêm bảng và migration theo [.devkit/rules/api.md](rules/api.md).
- Chưa chọn: auth (đăng nhập, phiên, 2FA) và hạ tầng deploy. Không tự thêm. Phần ticket cần xác định người gọi hay phân quyền theo người dùng là câu hỏi chặn ("cần chọn auth"): làm các AC còn lại theo mục Ranh giới ticket.

## Luật chung

- Làm trên branch hoặc worktree riêng, không commit hay push lên `main` (branch protection chặn). Merge do người duyệt (Đạt, gate G3 trên Telegram).
- Không đọc repo khác (aar-ui, aar-docs, aar-ops). Mọi trao đổi qua thẻ `aar/1` do Ops chuyển.
- Không đổi stack. Không tự chọn auth hay hạ tầng deploy. Thêm dependency runtime mới hay đổi một quyết định trong `.devkit/decisions/` cần ADR do người duyệt: khi chat thì hỏi người, khi Ops gọi thì báo `needs_input`.
