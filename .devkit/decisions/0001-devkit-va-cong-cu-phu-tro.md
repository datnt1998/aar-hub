# 0001. `.devkit/` là bộ luật duy nhất; AgentKit chỉ là công cụ phụ trợ, không commit

- Trạng thái: Chấp nhận
- Ngày: 2026-10-02
- Người quyết định: Đạt

## Bối cảnh

- Agent làm việc trong aar-hub theo hai cách: người chat trong checkout của mình, và Ops (Hermes) nhắn agent trong worktree Orca. Hai cách phải làm giống nhau.
- Worktree của Ops nằm ngoài repo (`~/orca/workspaces/aar-hub/<branch>`) và chỉ có file đã commit. File cài cục bộ không có ở đó.
- AgentKit (`ak`) cài theo project ghi `.omp/agents`, `.omp/rules`, `.omp/skills/ak-*`, `.agentkit/` và một khối `AGENTKIT-OMP` (khoảng 370 dòng) vào `AGENTS.md`. Luật của nó (plan trong `plans/`, docs trong `docs/`, brainstorm trước khi làm, tự tạo worktree, ship) khác contract của Ops. Nếu chỉ có trong phiên chat thì chat và Ops làm khác nhau; nếu commit thì worktree của Ops nhận luật trỏ tới skill không tồn tại.
- omp tự nạp `AGENTS.md` ở gốc và mở rộng `@path` thành nội dung file, kể cả file trong thư mục ẩn (đã thử). `AGENTS.md` trong thư mục con không được nạp hay trỏ tới (đã thử), nên không chia luật theo thư mục con.

## Các lựa chọn

1. **AgentKit cài theo project, không commit; `.devkit/` là luật.** Ops chạy chỉ theo luật đã commit nên dễ đoán. Mất: `AGENTS.md` trong checkout có ak luôn có thay đổi chưa commit.
2. **AgentKit cài global (`ak kit install --global`).** Repo sạch, Ops cũng có skill ak. Mất: hook ak chạy trong phiên tự động của Ops và mọi project khác; luật ak ở mức user nạp sau luật project nên nổi hơn. Hỏng trước tiên khi một hook ak chặn phiên Ops.
3. **Commit khối ak vào repo.** Worktree Ops nhận luật trỏ tới skill không có. Loại.

## Quyết định

Chọn lựa chọn 1.

- `.devkit/` chứa toàn bộ luật và quy trình code. `AGENTS.md` chỉ là cửa vào: `@.devkit/core.md` (luôn nạp) cùng bảng định tuyến tới `rules/` và `workflows/` (đọc khi cần, để context không phình theo số luật).
- Thứ tự ưu tiên: ticket/tin Ops > `.devkit/` > công cụ phụ trợ. `.devkit/core.md` liệt kê luật của công cụ phụ trợ không áp dụng trong repo.
- `.omp/` và `.agentkit/` nằm trong `.gitignore`. `pnpm devkit:check` (chạy trong `pnpm lint` và CI) đỏ khi khối `AGENTKIT` lọt vào `AGENTS.md`, khi `AGENTS.md` mất `@.devkit/core.md`, khi file của `.omp/` hay `.agentkit/` được track, khi link trong `.devkit/` hỏng, khi quy trình hay luật không có trong bảng định tuyến, khi ADR không có trong danh sách.

## Hệ quả

- Agent ở mọi runtime đọc được luật: omp mở rộng `@.devkit/core.md`; công cụ không mở rộng vẫn thấy đường dẫn để đọc.
- Workflow là Markdown thường, chưa đóng gói thành skill omp. Xem lại khi agent nhiều lần bỏ qua bước đọc quy trình: lúc đó chuyển `workflows/` thành skill.
- Muốn agent Ops dùng skill của ak thì phải có ADR mới thay quyết định này và smoke Ops lại.
