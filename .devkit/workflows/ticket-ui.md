# Làm ticket UI

Đọc kèm: [.devkit/rules/web.md](../rules/web.md), [.devkit/rules/testing.md](../rules/testing.md), [.devkit/rules/git.md](../rules/git.md).

1. **Đọc ticket và interface.** Liệt kê AC của màn hình. Interface lấy từ `handoff` của ticket BE cùng use case (Ops gửi trong message, trỏ vào `apps/api/openapi.json`) và từ `apps/web/src/api/schema.gen.ts`.
2. **Kiểm interface.** Endpoint hay field màn hình cần mà interface không có, hoặc lệch nhau: đó là câu hỏi, không sửa `apps/api`, không tự chế dữ liệu. Phân loại chặn/không chặn theo `.devkit/core.md`.
3. **Làm tiếp ticket đã có branch/PR:** đọc `git log origin/main..HEAD` và PR hiện tại (`gh pr view`) trước, chỉ làm phần còn thiếu.
4. **Code** màn hình theo [.devkit/rules/web.md](../rules/web.md), gọi API chỉ qua `api`.
5. **Test** từng AC: component test cho trạng thái và luồng của màn hình, e2e Playwright cho luồng chính qua API thật ([.devkit/rules/testing.md](../rules/testing.md)). Kiểm `pnpm ac` thấy đủ mã.
6. **Kiểm.** `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build && pnpm openapi:check` xanh.
7. **Review độc lập** theo [.devkit/workflows/review.md](review.md). Sửa lỗi chặn, chạy lại bước 6.
8. **Commit, push, PR** theo [.devkit/rules/git.md](../rules/git.md).
9. **Báo kết quả.** Khi Ops gọi: ghi result theo [.devkit/workflows/ops-session.md](ops-session.md). Khi chat: báo người link PR, AC → test, câu hỏi còn mở.
