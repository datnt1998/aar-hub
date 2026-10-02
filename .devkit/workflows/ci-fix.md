# Sửa CI đỏ

Làm trên branch và PR đang có.

1. **Xem lỗi.** `gh pr checks` để biết job đỏ; `gh run view <run-id> --log-failed` để đọc log.
2. **Tái hiện ở máy** bằng đúng lệnh của job (`.github/workflows/ci.yml`), bỏ cache: ví dụ `pnpm test:api --force`.
3. **Sửa nguyên nhân.** Không xoá, `.skip` hay nới test, không tắt luật lint, không sửa file sinh bằng tay (`openapi:check` đỏ thì chạy `pnpm openapi`; `format:check` đỏ thì chạy `pnpm format`). Lỗi không tái hiện được ở máy (chỉ đỏ trên CI): tìm khác biệt môi trường (Node, `CI=true`, cổng, múi giờ) thay vì chạy lại cho tới khi xanh.
4. **Kiểm đủ** bằng `pnpm verify`, commit `fix:` hoặc `test:`, push. Chỉ thêm commit mới.
5. **Xác nhận** `gh pr checks --watch` xanh. Khi Ops gọi: ghi result theo [.devkit/workflows/ops-session.md](ops-session.md).
