# Luật git và PR

- Làm trên branch riêng (Ops đặt sẵn branch trong worktree; khi chat, người chọn). Không commit hay push lên `main`.
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`… Không nhắc AI trong commit hay PR.
- Branch đã có PR thì chỉ thêm commit mới, không force-push: review và Ops theo dõi theo SHA.
- Một branch một PR vào `main`. Có PR rồi thì cập nhật PR đó (`gh pr view` / `gh pr edit`), không mở PR thứ hai.
- Không approve, merge, tag. Người duyệt merge (Đạt, gate G3 trên Telegram).

## Nội dung PR

PR của ticket ghi:

- Mã ticket và use case.
- AC → test: từ `pnpm ac` (AC nào chưa đạt và vì sao).
- Interface thay đổi (ticket BE): endpoint, DTO, vị trí trong `apps/api/openapi.json`.
- Câu hỏi còn mở.
- Lệnh kiểm đã chạy và kết quả.
