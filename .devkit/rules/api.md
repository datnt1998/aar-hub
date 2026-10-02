# Luật code `apps/api`

Lý do của các luật dưới đây: [ADR 0003](../decisions/0003-postgres-drizzle.md) (dữ liệu), [ADR 0004](../decisions/0004-hop-dong-http-cua-api.md) (validation, lỗi, response, cấu hình). Test của hành vi dùng chung: `apps/api/test/http-contract.e2e-spec.ts`.

## Cấu trúc

```
src/
  main.ts                 chỉ khởi động tiến trình (listen, shutdown hooks)
  app.module.ts           Config, Clock, Db, các module tính năng; filter lỗi và serializer toàn cục
  app.setup.ts            API_PREFIX, APP_OPTIONS, configureApp(): dùng chung cho server, test, xuất OpenAPI
  config/env.ts           schema Zod của biến môi trường
  common/http/            Problem, RequestValidationPipe, ResponseSerializerInterceptor, ProblemFilter, Returns, ApiProblem
  common/errors/          DomainError
  common/time/clock.ts    Clock
  db/                     DbModule, AppDb/DB, schema.ts, migrate.ts
  <feature>/
    <feature>.module.ts
    <feature>.controller.ts   chỉ HTTP: schema vào/ra, Returns/ApiProblem, gọi service
    <feature>.service.ts      điều phối use case: quyền, chuyển trạng thái, transaction
    <feature>.schemas.ts      schema Zod của request/response
    <feature>.errors.ts       các DomainError của tính năng
    <feature>.ts              luật nghiệp vụ thuần (hàm nhận `now: Date`), khi có
    <feature>.repository.ts   truy vấn Drizzle, khi có bảng; file duy nhất của tính năng đụng tới `DB`
    <feature>.spec.ts         unit test cho luật nghiệp vụ thuần
test/<feature>.e2e-spec.ts    test HTTP theo mã AC
```

- Mỗi tính năng một module, đăng ký trong `src/app.module.ts`. Mẫu tham chiếu: `src/health/`.
- Controller không chứa luật nghiệp vụ. Service không dùng kiểu HTTP (`HttpException`, `Request`): báo lỗi nghiệp vụ bằng `DomainError`.
- ESM: import file nội bộ có đuôi `.js`. Class được inject qua constructor phải import bằng `import`, không dùng `import type` (Nest mất metadata, lỗi DI lúc chạy).
- Không thêm lớp trừu tượng khi chỉ có một cài đặt: repository là class cụ thể, không interface/port, không `BaseRepository<T>`.

## Request và response

- Mọi input khai báo bằng schema Zod ngay trên tham số: `@Body({ schema: CreateX })`, `@Query({ schema: ListXQuery })`, `@Param('id', { schema: z.uuid() })`. Không dùng `class-validator`, `@ApiProperty` hay DTO class. Pipe toàn cục (`RequestValidationPipe`) kiểm và trả 400 khi sai.
- Body dùng `z.strictObject` (trường lạ bị từ chối); query dùng `z.object` với `z.coerce` cho số.
- Response khai bằng `@Returns(HttpStatus.X, Schema)`: vừa đặt status, vừa vào OpenAPI, vừa lọc kết quả theo schema (trường không khai bị bỏ; kết quả lệch schema thành 500). Response luôn là object; danh sách trả `{ items: [...] }`.
- Schema cấp cao nhất có `.meta({ id: 'PascalName' })`, id duy nhất toàn API (`InvitationCreateRequest`, `Invitation`). Thời gian trả dạng chuỗi ISO (`z.iso.datetime()`), đổi `Date` sang chuỗi trước khi trả.
- Path là danh từ số nhiều kebab-case; chuyển trạng thái là `POST /<resource>/{id}/<động-từ>` (`/invitations/{id}/accept`). Mỗi controller một `@ApiTags('<feature>')`.

## Lỗi

- Mọi lỗi trả `application/problem+json` (RFC 9457) với `code` bắt buộc; `ProblemFilter` lo việc này, không tự viết response lỗi.
- Lỗi nghiệp vụ: class trong `<feature>.errors.ts` kế thừa `DomainError`, `code` dạng `SCREAMING_SNAKE_CASE` có tiền tố tính năng, `kind` quyết định status, message tiếng Anh (thành `detail`):

  | `kind` | Status | Khi |
  |---|---|---|
  | `not_found` | 404 | Không có tài nguyên (hoặc người gọi không được biết là có) |
  | `forbidden` | 403 | Người gọi không có quyền làm việc này |
  | `conflict` | 409 | Request hợp lệ nhưng trạng thái hiện tại không cho (hết hạn, đã chấp nhận, đã chấm dứt…) |
  | `unprocessable` | 422 | Input đúng schema nhưng sai luật nghiệp vụ cần thêm dữ liệu để kiểm |

- Input sai schema: 400 `VALIDATION_FAILED`, `errors[]` gồm `pointer` (`/body/email`, `/query/page`, `/path/id`), `code` (mã issue của Zod) và `detail`.
- Mỗi route khai lỗi nghiệp vụ nó có thể trả bằng `@ApiProblem(409, 'INVITATION_EXPIRED', 'INVITATION_ALREADY_ACCEPTED')`, để client web có `error.code` đúng các mã đó. Xuất OpenAPI tự thêm response `default` là Problem cho mọi route.
- `detail` tiếng Anh, cho developer. Giao diện dịch `code` sang tiếng Việt; không hiển thị `detail`.
- Lỗi không lường trước thành 500 `INTERNAL_SERVER_ERROR`, được log kèm stack; message không bao giờ tới client.

## Dữ liệu

- PostgreSQL qua Drizzle. Bảng khai trong `src/db/schema.ts` (hoặc file của tính năng, re-export từ `schema.ts`). Đổi bảng thì `pnpm --filter api db:generate` và commit migration trong `apps/api/drizzle/`; CI chạy `pnpm db:check` và đỏ khi migration lệch schema. Không sửa migration đã merge; sửa bằng migration mới.
- Chỉ repository của tính năng inject `DB` (`@Inject(DB) private readonly db: AppDb`) và trả kiểu của tính năng, không trả kiểu row của Drizzle ra ngoài.
- Thao tác đổi nhiều bảng hoặc đọc rồi ghi theo trạng thái chạy trong `db.transaction(...)`; tranh chấp (hai người cùng chấp nhận một lời mời) chặn bằng ràng buộc unique hoặc `SELECT … FOR UPDATE`, không chỉ bằng kiểm tra trong code.
- Chạy migration vào database thật: `DATABASE_URL=… pnpm --filter api db:migrate`.

## Cấu hình, thời gian, log

- Biến môi trường khai trong `src/config/env.ts` (có mặc định an toàn nếu chỉ cần để khởi động) và đọc qua `ConfigService<Env, true>` (`config.get('PORT', { infer: true })`). Lint cấm `process.env` trong `src/`. Biến mới thêm vào `apps/api/.env.example`.
- Thời gian hiện tại lấy từ `Clock` (inject), không gọi `new Date()`/`Date.now()` trong service; hàm nghiệp vụ thuần nhận `now: Date`. Test điều khiển giờ qua `TestClock`.
- Log bằng `new Logger(X.name)` của `@nestjs/common` kèm tham số có cấu trúc. Lint cấm `console` trong `src/` (trừ script `openapi/export.ts`, `db/migrate.ts`). Không log token, OTP, mật khẩu, secret, email đầy đủ.
- Không bật CORS (web gọi cùng origin qua proxy `/api`). Header bảo mật bật sẵn trong `configureApp()`.

## Tài liệu interface (OpenAPI)

- Interface là OpenAPI sinh từ code: schema Zod của `@Body/@Query/@Param` và `@Returns`, cùng `@ApiProblem`. `operationId` là `<Controller>_<method>` (`Health_check`).
- Đổi API thì chạy `pnpm openapi` và commit cả `apps/api/openapi.json` lẫn `apps/web/src/api/schema.gen.ts`. CI chạy `pnpm openapi:check` và đỏ khi file lệch code.
- Ticket BE báo interface trong `handoff`: `summary` mô tả endpoint, schema, mã lỗi ticket cung cấp; `refs` gồm `apps/api/openapi.json` kèm path, ví dụ `apps/api/openapi.json#/paths/~1api~1health`. Ops chuyển vị trí này cho ticket UI qua thẻ `delivery`.
