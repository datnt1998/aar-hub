# 0002. Bộ kiểm cấp repo: Prettier, lint có type, ghim Node/pnpm, Renovate, squash-only

- Trạng thái: Chấp nhận
- Ngày: 2026-10-02
- Người quyết định: Đạt

## Bối cảnh

Agent viết phần lớn code và chạy đủ lệnh kiểm trước khi mở PR; CI bắt buộc (7 check, áp dụng cả admin). Trước quyết định này repo không có formatter, lint không dùng type (bỏ sót promise không await, `any`, switch thiếu nhánh), Node chỉ ghi `>=22` (pnpm chỉ cảnh báo), không có chính sách cập nhật dependency, và cho phép cả merge/rebase/squash.

## Các lựa chọn

1. **Formatter:** Prettier 3 (chỉ format) hay Biome (format, hoặc thay luôn ESLint). Biome thay ESLint mất luật có type (`noFloatingPromises` còn thử nghiệm), mất luật React Compiler của `eslint-plugin-react-hooks` 7 và cần cờ parser cho decorator Nest. Prettier chạy toàn repo 1,3 s.
2. **Mức lint:** `recommendedTypeChecked` + vài luật chọn lọc, hay `strictTypeChecked`. Bản strict ra 10 phát hiện trên repo, 6 là nhiễu với Nest/React (class `@Module` rỗng, `!` ở `getElementById`), và không ổn định giữa các bản minor.
3. **Git hook / commitlint** hay không. CI đã bắt buộc, agent đã chạy đủ kiểm; hook làm chậm mọi commit trong nhiều worktree và bỏ qua được bằng `--no-verify`.
4. **Cập nhật dependency:** Renovate hay Dependabot version updates. Docs Dependabot chỉ hỗ trợ pnpm tới v10.

## Quyết định

- Prettier `3.9.9` ghim chính xác, `singleQuote`, `printWidth: 120`; bỏ qua `*.md`, lockfile và hai file interface sinh ra (Prettier viết lại chúng thì `openapi:check` đỏ). `pnpm format:check` chạy trong job `lint` của CI. Có `.editorconfig`.
- ESLint `recommendedTypeChecked` + `switch-exhaustiveness-check`, `no-deprecated`, `return-await` (chỉ phần đúng/sai khi xử lý lỗi), cấm `it/test/describe.skip`; `react-hooks/exhaustive-deps` là lỗi; comment tắt luật không dùng là lỗi. Không bật `consistent-type-imports` và `verbatimModuleSyntax` ở API: `import type` một class được inject biên dịch qua nhưng Nest lỗi DI lúc chạy.
- TypeScript: `noUncheckedIndexedAccess` và `noImplicitOverride` ở cả hai app. Giữ TypeScript 6.0 (typescript-eslint 8.71 hỗ trợ < 6.1).
- Node: `.nvmrc` = 22, `engines.node` = `22.x`, CI đọc `.nvmrc`. pnpm: `engineStrict`, `minimumReleaseAge: 1440` (bản mới phát hành chưa đủ 24 giờ không được cài), `strictDepBuilds` (dependency có build script phải được cho phép hay bỏ qua tường minh), `verifyDepsBeforeRun: install`.
- Không git hook, không commitlint. Chỉ squash merge, tiêu đề commit trên `main` là tiêu đề PR; branch phải cập nhật với `main` trước khi merge.
- Renovate (app Mend, miễn phí cho repo private): 1 PR gom bản non-major mỗi thứ Hai, chờ bản phát hành 3 ngày, bản major và bản minor của TypeScript cần duyệt trên dependency dashboard, không tự merge. Bật Dependabot alerts (không bật PR của Dependabot).
- `.env*` bị ignore, trừ `.env.example`. Mẫu PR ở `.github/pull_request_template.md`; agent viết body theo mẫu bằng `gh pr create --body-file` (mẫu không tự áp khi dùng `--body`).

## Hệ quả

- PR không qua `format:check` hay lint có type thì CI đỏ; cách sửa là `pnpm format` và sửa lỗi lint, không tắt luật.
- Thêm dependency có build script phải ghi vào `pnpm-workspace.yaml` (`onlyBuiltDependencies` hoặc `ignoredBuiltDependencies`), nếu không `pnpm install` lỗi.
- Xem lại khi có điều kiện:
  - Có ≥2 PR trong một tuần đỏ chỉ vì format/lint → thêm hook `lefthook` (format + lint file đã stage).
  - Có credential thật trong workflow (ví dụ `DATABASE_URL`) → thêm job quét secret `gitleaks`.
  - Lần deploy đầu tiên → `pnpm audit --prod` chạy định kỳ, không chặn PR.
  - CI quá 10 phút hoặc dùng quá nửa phút Actions miễn phí → Turbo remote cache.
  - Có package nội bộ thứ ba → pnpm catalog; khi bật `--affected` phải khai `api` là dependency của `web` trước (nếu không e2e bị bỏ qua).
  - Có người review thứ hai hoặc agent dùng tài khoản bot → CODEOWNERS và bắt buộc review.
