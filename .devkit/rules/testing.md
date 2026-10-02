# Luật test

## Test gắn mã AC

- Test chứng minh một AC phải có **mã AC trong tên test** (chuỗi literal), ví dụ `it('AC-X-DEMO-01-02 từ chối khi hết hạn', …)`. Một test có thể mang nhiều mã.
- `pnpm ac` in mỗi dòng `<mã AC>\t<file>:<dòng>\t<tên test>`; không có test nào mang mã thì không in gì. `pnpm ac --json` in đúng dạng `ac_covered`: `[{"id": "AC-…", "tests": ["tên test"]}]`. Test `.skip`/`.todo` không được tính.
- Điền `ac_covered` bằng output của `pnpm ac --json`, không tự gõ.
- AC chỉ được tính khi test đi qua đúng lớp mà AC mô tả. AC về hành vi API cần test HTTP (`apps/api/test/*.e2e-spec.ts`, supertest); test gọi thẳng service không chứng minh AC đó.

## Vị trí

| Loại | Chỗ | Công cụ |
|---|---|---|
| Unit API | `apps/api/src/**/*.spec.ts` | Vitest, cho luật nghiệp vụ thuần (truyền `now` cụ thể) |
| HTTP API | `apps/api/test/**/*.e2e-spec.ts` | Vitest + supertest trên `createTestApp()` |
| Component web | `apps/web/src/**/*.test.tsx` | Vitest + Testing Library |
| E2E toàn bộ | `apps/web/e2e/*.spec.ts` | Playwright, tự bật API + web |

## Test API

- Dựng app bằng `createTestApp()` (`apps/api/test/support/create-test-app.ts`): `AppModule` thật với cùng `APP_OPTIONS`/`configureApp()` như server, PostgreSQL trong tiến trình (PGlite) đã chạy migration đã commit, và `TestClock`. Không tự dựng `Test.createTestingModule` riêng.
- Mỗi file một app (`beforeAll`), `close()` trong `afterAll`; chỉ test mà đối tượng là việc dựng app (route trùng, module lỗi) mới dựng app riêng trong test và `close()` trong `finally`. Dữ liệu một test không được ảnh hưởng test khác: tạo dữ liệu riêng trong test, hoặc `reset()` trong `beforeEach`.
- Thời gian: `createTestApp({ now })`, rồi `t.clock.advance(ms)` / `t.clock.set(date)`. Không dùng fake timer.
- Chuẩn bị dữ liệu qua API khi API có sẵn đường đó; chỉ ghi thẳng bằng `t.db` cho trạng thái API không tạo được (bản ghi đã hết hạn, dữ liệu của hệ thống khác).
- Test lỗi kiểm `status` và `body.code` (kèm `errors[].pointer` khi là `VALIDATION_FAILED`), không kiểm `detail`.
- Không mock repository, `DB` hay service của chính tính năng đang test; chỉ thay thứ ngoài hệ thống (gửi email, dịch vụ bên ngoài) qua `createTestApp({ override: (b) => b.overrideProvider(X).useValue(fake) })`.

## Luật chung

- Không xoá, bỏ qua hay nới test để CI xanh (lint cấm mọi cách giấu test: `.skip`, `.skipIf`, `.runIf`, `.fixme` trên `it`/`test`/`describe`/`suite`, kể cả `test.describe.skip` và `test.fixme`; `.todo` được phép). Test sai thì sửa test và nói lý do trong PR.
- E2E chạy song song nhiều worktree: đổi cổng bằng `E2E_API_PORT` / `E2E_WEB_PORT`. Playwright không dùng lại server lạ đang chiếm cổng.
