# Khi Ops nhắn trong Orca

Ops (Hermes) gửi tin vào terminal Orca đang chạy agent chat của repo này, trong một worktree trên branch của ticket. Worktree, terminal, timeout và dọn dẹp do Ops lo; repo không chứa lệnh `orca` hay code điều phối.

1. **Đầu vào.** Tin của Ops ghi hai đường dẫn tuyệt đối nằm ngoài repo: **message file** (Markdown: nhiệm vụ, nội dung ticket, interface BE phụ thuộc, luật, schema kết quả hợp lệ) và **result file**. Chỉ đọc repo hiện tại và các file Ops nêu tên trong tin (message file, file câu trả lời ở lượt sau). Không đọc repo khác hay file nào khác ngoài repo.
2. **Branch.** Kiểm `git symbolic-ref --short -q HEAD`. Đang ở `main` hoặc detached HEAD thì không sửa gì, ghi result `error` rồi dừng. Không đổi branch.
3. **Làm việc.** Chọn quy trình theo nhiệm vụ trong message, làm như khi người chat:

   | Nhiệm vụ | Quy trình |
   |---|---|
   | Làm ticket BE, làm tiếp ticket BE | [.devkit/workflows/ticket-be.md](ticket-be.md) |
   | Làm ticket UI, làm tiếp ticket UI | [.devkit/workflows/ticket-ui.md](ticket-ui.md) |
   | Sửa theo review | [.devkit/workflows/rework.md](rework.md) |
   | Sửa CI | [.devkit/workflows/ci-fix.md](ci-fix.md) |
   | Review độc lập | [.devkit/workflows/review.md](review.md) |

   Trước khi báo `pr_opened`: chạy đủ lệnh kiểm, review độc lập và sửa các lỗi chặn.
4. **Git.** Chỉ khi báo `pr_opened` (hoặc `spec_gap` có AC đã làm): commit trên branch hiện tại, push branch đó, mở working PR vào `main` hoặc cập nhật PR đã có của branch (`gh pr view` / `gh pr create`). Không mở PR chỉ để báo câu hỏi. Không approve, merge, tag, không push lên `main`.
5. **Kết quả.** Ghi **đúng một** object JSON vào result file theo đúng một dạng message nêu, `status` là một trong `pr_opened`, `spec_gap`, `needs_input`, `error`. Ghi **atomically**: viết file tạm cạnh result file (ví dụ `<result>.tmp`), kiểm JSON hợp lệ (`node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' <tmp>`), rồi `mv` đè lên result file. Không ghi từng phần, không ghi hai lần trong một lượt.
   - `pr_opened`: branch, HEAD và PR đều thật: branch hiện tại, SHA đã push (`git rev-parse HEAD` bằng `headRefOid` của `gh pr view --json url,headRefOid`), URL working PR. Kèm thẻ `aar/1` `delivery` hợp lệ: `ac_covered` lấy từ `pnpm ac --json`; ticket BE có `handoff` ([.devkit/rules/api.md](../rules/api.md), mục tài liệu interface). Câu hỏi không chặn đi kèm dưới dạng thẻ `question`.
   - `spec_gap`: kèm thẻ `question` cho từng câu hỏi; các AC không bị chặn đã commit và push.
   - `needs_input`: `message` là **nguyên văn** lượt hỏi cần người quyết định, đúng như sẽ nói với người khi chat. Ops chuyển nguyên văn lên Telegram. Sau đó chờ trong terminal.
   - `error`: `summary` và `error` nêu lý do (đang ở `main`, lệnh kiểm đỏ không sửa được…).
6. **Lượt sau.** Ops gửi câu trả lời của người hoặc việc tiếp theo vào cùng terminal Orca. Tiếp tục trong cùng phiên như chat và ghi lại result file theo tin mới.
7. **Review độc lập.** Review luôn chạy bằng subagent `reviewer` hoặc session riêng theo [.devkit/workflows/review.md](review.md), không dùng ngữ cảnh đã code.
