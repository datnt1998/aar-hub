# 0004. Hợp đồng HTTP của API: Zod, Problem Details có `code`, response lọc theo schema

- Trạng thái: Chấp nhận
- Ngày: 2026-10-02
- Người quyết định: Đạt

## Bối cảnh

- Ticket UI chỉ thấy API qua `apps/api/openapi.json` và client có type. Mọi request, response và lỗi phải nằm trong interface đó.
- Trước quyết định này DTO dùng `@ApiProperty` (chỉ mô tả, không kiểm) và chưa có quy ước lỗi. PR #2 tự viết hàm kiểm input và một kiểu lỗi riêng (`errors[{field, reason}]`); ticket sau sẽ tự đặt kiểu khác nếu không có base.
- NestJS 12 có sẵn: validation và serialize bằng Standard Schema (`@Body({ schema })`, `StandardSchemaValidationPipe`, `StandardSchemaSerializerInterceptor`), `@nestjs/swagger` 12 chuyển schema Zod 4 thành OpenAPI, `errorCode` trên `HttpException`, header bảo mật (`useSecurityHeaders`), phát hiện route trùng.

## Các lựa chọn

1. **Validation:** Zod 4 qua pipe có sẵn của Nest, hay `class-validator` + `class-transformer` (hai bộ decorator mỗi trường, `class-transformer` không phát hành từ 2021, dựa vào metadata mà Oxc sinh không đủ), hay `nestjs-zod` (chưa hỗ trợ Nest 12).
2. **Lỗi:** body mặc định của Nest (`message` lúc là chuỗi lúc là mảng, `errorCode` không bắt buộc), hay RFC 9457 Problem Details có `code` bắt buộc.
3. **Thông điệp lỗi cho người dùng:** API trả câu tiếng Việt, hay API trả `code` + `detail` tiếng Anh và giao diện dịch `code`.

## Quyết định

- Input khai bằng schema Zod trên tham số; `RequestValidationPipe` (kế thừa pipe có sẵn) trả 400 `VALIDATION_FAILED` với `errors[]` gồm `pointer` (JSON Pointer có tiền tố vị trí: `/body/…`, `/query/…`, `/path/…`), `code` (mã issue của Zod) và `detail`.
- Response khai bằng `@Returns(status, schema)`; serializer toàn cục lọc kết quả theo schema, kết quả lệch schema thành 500. Response luôn là object.
- Mọi lỗi là `application/problem+json`: `type`, `title`, `status`, `code` (bắt buộc), `detail` (tiếng Anh, cho developer), `instance` (path, không có query), `errors?`. Một `ProblemFilter` toàn cục: lỗi nghiệp vụ (`DomainError`, status theo `kind`), `HttpException` (giữ `errorCode`, không có thì lấy từ status), lỗi client của tầng HTTP (413, JSON hỏng) giữ status, còn lại 500 được log và không lộ message.
- Giao diện dịch `code` sang tiếng Việt; API không trả câu cho người dùng cuối.
- `@ApiProblem(status, ...codes)` khai mã lỗi của route để client có union `error.code`; xuất OpenAPI thêm response `default` là Problem cho mọi route.
- Cấu hình: `@nestjs/config` với schema Zod (`src/config/env.ts`), kiểm khi khởi động; lint cấm `process.env` trong `src/`.
- Dùng chung giữa server, test và xuất OpenAPI: `APP_OPTIONS` (`routeResolutionStrategy: 'specificity'` để route cụ thể thắng route tham số bất kể thứ tự khai; route trùng là lỗi khi khởi động) và `configureApp()` (header bảo mật, tiền tố `/api`, pipe). `enableShutdownHooks()` chỉ ở `main.ts`. CORS tắt.
- Thời gian qua `Clock` inject; log qua `Logger` của Nest, lint cấm `console`.

## Hệ quả

- Một schema Zod là validation, kiểu TypeScript, OpenAPI và bộ lọc response; không còn DTO class.
- Client web có type cho mọi lỗi; `error.code` của route có `@ApiProblem` là union cụ thể.
- Route tĩnh và route tham số cùng cấp (`/pending`, `/:id`) chạy đúng không phụ thuộc thứ tự; phát hiện "route bị che" (`shadow`) tắt vì cảnh báo cả cặp hợp lệ này.
- Xem lại khi có điều kiện:
  - Endpoint đầu tiên kiểm secret (chấp nhận lời mời, đăng nhập, 2FA) → `@nestjs/throttler` trên các route đó; `nestjs-pino` (request id, che header nhạy cảm).
  - Auth dùng cookie → `app.enableCsrfProtection()`.
  - Web chạy khác origin với API → CORS theo danh sách origin.
  - Deploy sau proxy → `trust proxy`, log JSON.
