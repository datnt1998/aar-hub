# Làm ticket UI

Đọc kèm: [.devkit/rules/web.md](../rules/web.md), [.devkit/rules/testing.md](../rules/testing.md), [.devkit/rules/git.md](../rules/git.md).

1. **Đọc ticket và interface.** Liệt kê AC của màn hình. Interface lấy từ `handoff` của ticket BE cùng use case (Ops gửi trong message, trỏ vào `apps/api/openapi.json`) và từ `apps/web/src/api/schema.gen.ts`.
2. **Kiểm interface.** Endpoint hay field màn hình cần mà interface không có, hoặc lệch nhau: đó là câu hỏi, không sửa `apps/api`, không tự chế dữ liệu. Phân loại chặn/không chặn theo `.devkit/core.md`.
3. **Làm tiếp ticket đã có branch/PR:** đọc `git log origin/main..HEAD` và PR hiện tại (`gh pr view`) trước, chỉ làm phần còn thiếu.
4. **Code** theo [.devkit/rules/web.md](../rules/web.md): `queries.ts` của miền → màn hình trong `features/<miền>/` → route mỏng trong `src/routes/`; form dùng `src/ui` và `applyProblem`; mã lỗi của interface có câu tiếng Việt.
5. **Test** từng AC: component test qua `renderRoute()` với handler MSW có type cho trạng thái và luồng của màn hình (kể cả từng mã lỗi), e2e Playwright cho luồng chính qua API thật kèm `expectAccessible()` ([.devkit/rules/testing.md](../rules/testing.md)). Kiểm `pnpm ac` thấy đủ mã.
6. **Kiểm.** `pnpm verify` xanh.
7. **Review độc lập** theo [.devkit/workflows/review.md](review.md). Sửa lỗi chặn, chạy lại bước 6.
8. **Commit, push, PR** theo [.devkit/rules/git.md](../rules/git.md).
9. **Báo kết quả.** Khi Ops gọi: ghi result theo [.devkit/workflows/ops-session.md](ops-session.md). Khi chat: báo người link PR, AC → test, câu hỏi còn mở.
