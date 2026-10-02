# Luật test

## Test gắn mã AC

- Test chứng minh một AC phải có **mã AC trong tên test** (chuỗi literal), ví dụ `it('AC-X-DEMO-01-02 từ chối khi hết hạn', …)`. Một test có thể mang nhiều mã.
- `pnpm ac` in mỗi dòng `<mã AC>\t<file>:<dòng>\t<tên test>`; không có test nào mang mã thì không in gì. `pnpm ac --json` in đúng dạng `ac_covered`: `[{"id": "AC-…", "tests": ["tên test"]}]`. Test `.skip`/`.todo` không được tính.
- Điền `ac_covered` bằng output của `pnpm ac --json`, không tự gõ.
- AC chỉ được tính khi test đi qua đúng lớp mà AC mô tả. AC về hành vi API cần test HTTP (`apps/api/test/*.e2e-spec.ts`, supertest); test gọi thẳng service không chứng minh AC đó.

## Vị trí

| Loại | Chỗ | Công cụ |
|---|---|---|
| Unit API | `apps/api/src/**/*.spec.ts` | Vitest |
| HTTP API | `apps/api/test/**/*.e2e-spec.ts` | Vitest + supertest, app dựng bằng `configureApp()` |
| Component web | `apps/web/src/**/*.test.tsx` | Vitest + Testing Library |
| E2E toàn bộ | `apps/web/e2e/*.spec.ts` | Playwright, tự bật API + web |

## Luật chung

- Không xoá, `.skip` hay nới test để CI xanh (lint cấm `it/test/describe.skip`). Test sai thì sửa test và nói lý do trong PR.
- E2E chạy song song nhiều worktree: đổi cổng bằng `E2E_API_PORT` / `E2E_WEB_PORT`. Playwright không dùng lại server lạ đang chiếm cổng.
