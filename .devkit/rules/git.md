# Luật git và PR

- Làm trên branch riêng (Ops đặt sẵn branch trong worktree; khi chat, người chọn). Không commit hay push lên `main`.
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`… Không nhắc AI trong commit hay PR. Repo chỉ cho squash merge và lấy **tiêu đề PR** làm commit trên `main`, nên tiêu đề PR cũng phải theo conventional commits.
- Branch đã có PR thì chỉ thêm commit mới, không force-push: review và Ops theo dõi theo SHA.
- Một branch một PR vào `main`. Có PR rồi thì cập nhật PR đó (`gh pr view` / `gh pr edit`), không mở PR thứ hai.
- Không approve, merge, tag. Người duyệt merge (Đạt, gate G3 trên Telegram).

## Nội dung PR

Body PR theo đúng các mục của [.github/pull_request_template.md](../../.github/pull_request_template.md): viết vào file rồi `gh pr create --body-file <file>` (hay `gh pr edit --body-file`). `--body` và `--fill` bỏ qua mẫu.

- **Ticket:** mã ticket và use case.
- **AC:** output `pnpm ac` cho tiền tố AC của ticket; AC nào chưa đạt và vì sao.
- **Interface** (ticket BE): endpoint, schema, mã lỗi, vị trí trong `apps/api/openapi.json`.
- **Quyết định và câu hỏi:** dependency mới, ADR, câu hỏi còn mở.
- **Đã chạy:** đánh dấu lệnh kiểm và review đã chạy thật; chưa chạy thì để trống và nói lý do.
