# Luật code `apps/api`

## Module

- Mỗi tính năng một module trong `apps/api/src/<feature>/`: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.dto.ts`. Đăng ký module trong `src/app.module.ts`.
- Controller chỉ nhận request và trả response; luật nghiệp vụ nằm trong service.
- Mọi route nằm dưới tiền tố `/api` (`API_PREFIX` trong `src/app.setup.ts`). Cấu hình dùng chung cho server, test và xuất OpenAPI đặt trong `configureApp()`, không đặt riêng trong `main.ts`.
- ESM: import file nội bộ có đuôi `.js` (`./health.service.js`). Class được inject qua constructor phải import bằng `import`, không dùng `import type` (Nest mất metadata và báo không resolve được dependency lúc chạy).
- Mẫu tham chiếu hiện có: `src/health/`.

## Tài liệu interface (OpenAPI)

- Interface là OpenAPI sinh từ decorator `@nestjs/swagger` (`@ApiProperty` trên DTO, `@ApiOkResponse`… trên controller). Mọi endpoint có DTO request/response khai báo đủ, kể cả response lỗi.
- Đổi API thì chạy `pnpm openapi` và commit cả `apps/api/openapi.json` lẫn `apps/web/src/api/schema.gen.ts`. CI chạy `pnpm openapi:check` và đỏ khi file lệch code.
- Ticket BE báo interface trong `handoff`: `summary` mô tả endpoint/DTO ticket cung cấp, `refs` gồm `apps/api/openapi.json` kèm path, ví dụ `apps/api/openapi.json#/paths/~1api~1health`. Ops chuyển vị trí này cho ticket UI qua thẻ `delivery`.
