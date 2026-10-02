# Làm ticket BE

Đọc kèm: [.devkit/rules/api.md](../rules/api.md), [.devkit/rules/testing.md](../rules/testing.md), [.devkit/rules/git.md](../rules/git.md).

1. **Đọc ticket.** Liệt kê AC, luật nghiệp vụ, phụ thuộc (ticket BE khác, interface có sẵn). Điểm thiếu hay mâu thuẫn: phân loại chặn/không chặn theo mục ranh giới ticket trong `.devkit/core.md`.
2. **Kiểm điều kiện.** Ticket cần bảng mới thì tự thêm theo [.devkit/rules/api.md](../rules/api.md) (mục Dữ liệu). Ticket cần auth hay hạ tầng deploy (chưa chọn, không tự thêm) thì phần đó là câu hỏi chặn ("cần chọn auth"), làm các AC còn lại (`.devkit/core.md` mục Hạ tầng đã chọn và chưa chọn). Cần thêm dependency runtime mới hay đổi quyết định thì cần ADR: chat hỏi người, Ops báo `needs_input` (mục Luật chung).
3. **Làm tiếp ticket đã có branch/PR:** đọc `git log origin/main..HEAD` và PR hiện tại (`gh pr view`) trước, chỉ làm phần còn thiếu.
4. **Code** theo [.devkit/rules/api.md](../rules/api.md): module tính năng, schema Zod cho input và `@Returns`, lỗi nghiệp vụ là `DomainError` khai bằng `@ApiProblem`; đổi bảng thì `pnpm --filter api db:generate`.
5. **Test** từng AC trong phạm vi, mỗi AC có test mang mã AC đi qua đúng lớp AC mô tả ([.devkit/rules/testing.md](../rules/testing.md)). Kiểm `pnpm ac` thấy đủ mã.
6. **Interface.** `pnpm openapi`, commit `apps/api/openapi.json` và `apps/web/src/api/schema.gen.ts`.
7. **Kiểm.** `pnpm verify` xanh.
8. **Review độc lập** theo [.devkit/workflows/review.md](review.md). Sửa lỗi chặn, chạy lại bước 7.
9. **Commit, push, PR** theo [.devkit/rules/git.md](../rules/git.md).
10. **Báo kết quả.** Khi Ops gọi: ghi result theo [.devkit/workflows/ops-session.md](ops-session.md), kèm `handoff` interface. Khi chat: báo người link PR, AC → test, interface, câu hỏi còn mở.
