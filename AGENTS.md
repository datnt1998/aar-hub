# aar-hub

Project **Tech** của hệ AAR: app sản phẩm gồm API (`apps/api`) và giao diện (`apps/web`), làm theo **ticket** do BA phát hành. Mỗi use case có một ticket **BE** và một ticket **UI**. Người chat trực tiếp với agent (omp/Orca) và Ops nhắn agent trong Orca đều dùng file này; agent làm giống nhau ở cả hai cách.

## Cấu trúc

Monorepo pnpm workspace + Turborepo (`turbo.json`), Node ≥ 22, pnpm 10.

| Đường dẫn | Nội dung |
|---|---|
| `apps/api` | NestJS 12 (ESM). Module theo tính năng trong `src/<feature>/`. Test: Vitest (mặc định của Nest 12), `src/**/*.spec.ts` và `test/**/*.e2e-spec.ts` |
| `apps/api/openapi.json` | **Tài liệu interface** của API, sinh từ code |
| `apps/web` | React 19 + Vite + Tailwind v4. Test: Vitest `src/**/*.test.tsx`, Playwright `e2e/*.spec.ts` |
| `apps/web/src/api/client.ts` | Client có type gọi API (`openapi-fetch`) |
| `apps/web/src/api/schema.gen.ts` | Type sinh từ `openapi.json`, không sửa tay |
| `scripts/ac-tests.mjs` | Liệt kê test theo mã AC |

## Lệnh

Chạy ở gốc repo. Các lệnh qua `turbo` có cache; bỏ cache bằng `--force` ngay sau tên lệnh (`pnpm test --force`, không dùng `pnpm test -- --force`).

| Việc | Lệnh |
|---|---|
| Cài | `pnpm install` (CI: `pnpm install --frozen-lockfile`) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` (riêng: `pnpm test:api`, `pnpm test:web`) |
| E2E | `pnpm e2e` (lần đầu: `pnpm --filter web exec playwright install chromium`). Tự bật API cổng 3000 và web cổng 5173; cổng bận (worktree khác đang chạy) thì đổi: `E2E_API_PORT=3100 E2E_WEB_PORT=5273 pnpm e2e` |
| Build | `pnpm build` |
| Xuất tài liệu interface | `pnpm openapi` (ghi `apps/api/openapi.json` rồi sinh `apps/web/src/api/schema.gen.ts`) |
| Kiểm tài liệu interface không lệch | `pnpm openapi:check` |
| Liệt kê test theo AC | `pnpm ac`, `pnpm ac --json`, `pnpm ac AC-X-DEMO-01` |
| Chạy dev | `pnpm --filter api start:dev` và `pnpm --filter web dev` (Vite proxy `/api` → `http://localhost:3000`, đổi bằng `API_URL`) |

Trước khi báo xong: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build && pnpm openapi:check`.

## Ranh giới ticket

- **BE:** chỉ hành vi nghiệp vụ: dữ liệu, chuyển trạng thái, quyền, luật nghiệp vụ, thông báo. Không làm màn hình. Cập nhật tài liệu interface (mục dưới).
- **UI:** dựng màn hình trong `apps/web` trên interface của ticket BE cùng use case. Không đổi hành vi nghiệp vụ, không sửa `apps/api`. Màn hình lệch với interface thì đó là câu hỏi, không tự sửa.
- Nghiệp vụ chỉ lấy từ ticket. Không đoán.
  - Câu hỏi chặn một phần việc: commit các AC không bị ảnh hưởng (kèm test), rồi báo `spec_gap` (Ops) hoặc hỏi người (chat).
  - Câu hỏi không chặn: làm xong, ghi câu hỏi vào `questions`.

## Database

PostgreSQL (bản mới nhất) qua Drizzle ORM (`drizzle-orm`, `pg`), do người chọn. Repo chưa chọn auth hay hạ tầng deploy. Không tự thêm. Ticket cần auth (nhận diện người đăng nhập) thì dừng phần đó: khi Ops gọi, báo `spec_gap` (hoặc `error` nếu không còn AC nào làm được); khi chat, nói với người.

- Schema: `apps/api/src/db/schema.ts`. Đổi schema thì chạy `pnpm --filter api db:generate` và commit thư mục `apps/api/drizzle/` (migration SQL).
- Áp migration: `pnpm --filter api build && DATABASE_URL=… pnpm --filter api db:migrate`. API kết nối qua `DATABASE_URL` (kết nối lười: không có DB thì `/api/health` và xuất OpenAPI vẫn chạy).
- Test API dùng PGlite (PostgreSQL chạy trong tiến trình, áp đúng migration đã commit) qua `apps/api/test/support/test-app.ts`; không cần cài Postgres.

## Tài liệu interface của ticket BE

- Interface là OpenAPI sinh từ decorator `@nestjs/swagger` (`@ApiProperty` trên DTO, `@ApiOkResponse`… trên controller). Mọi endpoint có DTO request/response khai báo đủ.
- Ticket BE thay đổi API thì chạy `pnpm openapi` và commit cả `apps/api/openapi.json` lẫn `apps/web/src/api/schema.gen.ts`. CI chạy `pnpm openapi:check` và đỏ khi file lệch code.
- Ticket BE báo interface trong `handoff`: `summary` mô tả endpoint/DTO ticket cung cấp, `refs` gồm `apps/api/openapi.json` (kèm path, ví dụ `apps/api/openapi.json#/paths/~1api~1health`). Ops chuyển vị trí này cho ticket UI qua thẻ `delivery`.

## Client API

- Giao diện chỉ gọi API qua `api` trong `apps/web/src/api/client.ts`: `api.GET('/api/health')`, `api.POST(...)`. Path và body có type từ `schema.gen.ts`.
- Thêm endpoint: ticket BE thêm controller/DTO trong `apps/api`, chạy `pnpm openapi`. Ticket UI dùng ngay `api.<METHOD>('<path>')`, không viết `fetch` tay, không khai lại type.
- Mọi route API nằm dưới tiền tố `/api` (`apps/api/src/app.setup.ts`).

## Giao diện

- Màn hình viết bằng React + class Tailwind trong `apps/web/src`. Chưa có thư viện component dùng chung; không tự thêm thư viện UI.
- CSS gốc là `apps/web/src/index.css` (`@import "tailwindcss"`).

## Test gắn mã AC

- Test chứng minh một AC phải có **mã AC trong tên test** (chuỗi literal), ví dụ `it('AC-X-DEMO-01-02 từ chối khi hết hạn', …)`. Một test có thể mang nhiều mã.
- `pnpm ac` in mỗi dòng `<mã AC>\t<file>:<dòng>\t<tên test>`; không có test nào mang mã thì không in gì. `pnpm ac --json` in đúng dạng `ac_covered`: `[{"id": "AC-…", "tests": ["tên test"]}]`. Test `.skip`/`.todo` không được tính.
- Điền `ac_covered` bằng output của `pnpm ac --json`, không tự gõ.

## Review PR

- Review PR của agent hay của team theo luật trong file này: ranh giới ticket, tài liệu interface, test gắn AC, luật database, lệnh kiểm xanh.
- PR ghi mã ticket thì đối chiếu từng AC của ticket với test mang mã đó (`pnpm ac`) và với code.
- Review phải độc lập với phiên đã code: dùng subagent `reviewer` hoặc một session riêng không mang ngữ cảnh code. Không tự review trong cùng mạch đã viết code.

## Khi Ops nhắn trong Orca

Ops (Hermes) gửi tin vào terminal Orca đang chạy agent chat của repo này, trong một worktree trên branch của ticket. Worktree, terminal, timeout và dọn dẹp do Ops lo; repo không chứa lệnh `orca` hay code điều phối.

1. **Đầu vào.** Tin của Ops ghi hai đường dẫn tuyệt đối nằm ngoài repo: **message file** (Markdown: nhiệm vụ, nội dung ticket, interface BE phụ thuộc, luật, schema kết quả hợp lệ) và **result file**. Chỉ đọc repo hiện tại và các file Ops nêu tên trong tin (message file, file câu trả lời ở lượt sau). Không đọc repo khác hay file nào khác ngoài repo.
2. **Branch.** Kiểm `git symbolic-ref --short -q HEAD`. Đang ở `main` hoặc detached HEAD thì không sửa gì, ghi result `error` rồi dừng. Không đổi branch.
3. **Làm việc.** Làm đúng nhiệm vụ trong message (làm ticket, làm tiếp, sửa theo review, sửa CI, review độc lập) như khi người chat, theo file này. Trước khi báo `pr_opened`: chạy đủ lệnh kiểm, review độc lập (mục Review PR) và sửa các lỗi chặn.
4. **Git.** Chỉ khi báo `pr_opened` (hoặc `spec_gap` có AC đã làm): commit trên branch hiện tại, push branch đó, mở working PR vào `main` hoặc cập nhật PR đã có của branch (`gh pr view` / `gh pr create`). Không mở PR chỉ để báo câu hỏi. Không approve, merge, tag, không push lên `main`.
5. **Kết quả.** Ghi **đúng một** object JSON vào result file theo đúng một dạng message nêu, `status` là một trong `pr_opened`, `spec_gap`, `needs_input`, `error`. Ghi **atomically**: viết file tạm cạnh result file (ví dụ `<result>.tmp`), kiểm JSON hợp lệ (`node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' <tmp>`), rồi `mv` đè lên result file. Không ghi từng phần, không ghi hai lần trong một lượt.
   - `pr_opened`: branch, HEAD và PR đều thật: branch hiện tại, SHA đã push (`git rev-parse HEAD` bằng `headRefOid` của `gh pr view --json url,headRefOid`), URL working PR. Kèm thẻ `aar/1` `delivery` hợp lệ: `ac_covered` lấy từ `pnpm ac --json`; ticket BE có `handoff` (mục tài liệu interface). Câu hỏi không chặn đi kèm dưới dạng thẻ `question`.
   - `spec_gap`: kèm thẻ `question` cho từng câu hỏi; các AC không bị chặn đã commit và push.
   - `needs_input`: `message` là **nguyên văn** lượt hỏi cần người quyết định, đúng như sẽ nói với người khi chat. Ops chuyển nguyên văn lên Telegram. Sau đó chờ trong terminal.
   - `error`: `summary` và `error` nêu lý do (đang ở `main`, lệnh kiểm đỏ không sửa được…).
6. **Lượt sau.** Ops gửi câu trả lời của người hoặc việc tiếp theo vào cùng terminal Orca. Tiếp tục trong cùng phiên như chat và ghi lại result file theo tin mới.
7. **Review độc lập.** Review luôn chạy bằng subagent `reviewer` hoặc session riêng theo mục Review PR, không dùng ngữ cảnh đã code.

## Luật chung

- Làm trên branch hoặc worktree riêng, không commit hay push lên `main`. Merge do người duyệt (Đạt, gate G3 trên Telegram).
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`…), không nhắc AI trong commit hay PR.
- Không đọc repo khác (aar-ui, aar-docs, aar-ops). Mọi trao đổi qua thẻ `aar/1` do Ops chuyển.
- Không đổi stack. Không chọn auth, hạ tầng deploy.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
