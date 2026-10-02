# 0003. Dữ liệu: PostgreSQL + Drizzle; test trên PGlite

- Trạng thái: Chấp nhận
- Ngày: 2026-10-02
- Người quyết định: Đạt

## Bối cảnh

- Ticket đầu tiên cần lưu dữ liệu (FEAT-PARTNER-ONBOARDING BE-01, PR #2) đã chọn PostgreSQL + Drizzle khi làm ticket, và ghi quyết định trong `AGENTS.md` và body PR. Quyết định cần nằm ở một chỗ, trước khi ticket khác dựa vào.
- Các tính năng sắp tới: lời mời có hạn, chấp nhận một lần, chấm dứt đối tác. Cần `timestamptz`, unique index một phần, khoá dòng khi chấp nhận đồng thời.
- API chạy ESM, test bằng Vitest (transform Oxc). Metadata decorator của Oxc không đầy đủ: thư viện dựa vào reflection (entity decorator) chạy khác nhau giữa test và `nest build`.
- Agent chạy song song trong nhiều worktree: test không được phụ thuộc một cổng hay một server database chung.

## Các lựa chọn

1. **Drizzle** (`drizzle-orm` 0.45, `drizzle-kit` 0.31): schema là TypeScript, không sinh code, không decorator; migration SQL do `drizzle-kit` sinh, review được. Nhược: chưa tới 1.0 (1.0 đang beta), không có module Nest chính thức (provider tự viết khoảng 20 dòng).
2. **Prisma 7**: công cụ migration tốt, agent quen. Nhược: thêm bước sinh client vào CI; `prisma@latest` đang là bản 8 RC trong khi `@prisma/client@latest` là 7, cài không ghim sẽ lệch major.
3. **TypeORM / MikroORM**: có module Nest chính thức. Nhược: entity dựa vào metadata decorator (lệch giữa Oxc và `tsc`); MikroORM cần fork EntityManager theo request.

Test với database:

1. **PGlite** (PostgreSQL biên dịch WASM, chạy trong tiến trình): mỗi file test một database riêng, không Docker, không cổng. Nhược: một kết nối, không kiểm được tranh chấp giữa nhiều kết nối thật.
2. **Testcontainers**: PostgreSQL thật. Nhược: cần Docker ở máy dev và agent, chậm hơn khi khởi động.

## Quyết định

- PostgreSQL, truy cập qua Drizzle (`drizzle-orm/node-postgres`, `pg`). `DbModule` tạo pool lười (kết nối ở truy vấn đầu tiên), nên API khởi động và xuất OpenAPI không cần database.
- Bảng khai trong `apps/api/src/db/schema.ts`; migration SQL sinh bằng `pnpm --filter api db:generate`, commit trong `apps/api/drizzle/`; `pnpm db:check` trong CI đỏ khi migration lệch schema. Áp migration bằng `pnpm --filter api db:migrate`.
- Truy cập dữ liệu qua repository cụ thể của từng tính năng, trả kiểu của tính năng.
- Test HTTP dùng PGlite qua `createTestApp()`, chạy đúng các migration đã commit.

## Hệ quả

- Ticket cần bảng mới tự thêm bảng và migration, không cần hỏi lại về database. Auth và hạ tầng deploy vẫn chưa chọn.
- Kết nối database thật ở máy dev do người chạy tự cấp (`DATABASE_URL` trong `apps/api/.env`); repo không chứa docker compose hay cấu hình hạ tầng.
- Xem lại khi có điều kiện:
  - Luật cần kiểm tranh chấp giữa nhiều kết nối (khoá dòng, isolation) → thêm Testcontainers PostgreSQL cho các test đó.
  - Test e2e Playwright cần dữ liệu (ticket UI đầu tiên đọc/ghi qua API có database) → cho API trong e2e chạy trên PGlite (`@electric-sql/pglite-socket`) hoặc PostgreSQL service của CI; quyết định trong ADR khi tới.
  - Drizzle 1.0 ổn định → nâng cấp trong một PR riêng.
