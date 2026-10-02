# Review độc lập

Áp dụng cho PR của agent và của team.

## Ai review

- Phiên khác với phiên đã code: subagent `reviewer` hoặc một session riêng không mang ngữ cảnh code. Không tự review trong cùng mạch đã viết code.
- Người code giao cho reviewer: nội dung ticket (AC, luật nghiệp vụ), phạm vi diff (`git diff origin/main...HEAD`), output `pnpm ac`, và đường dẫn file này. Không giao lời giải thích về cách đã làm.

## Kiểm gì

1. **AC.** Mỗi AC trong phạm vi có test mang mã AC (`pnpm ac`), test đó thật sự chứng minh AC (đúng lớp, đúng biên, đúng trường hợp lỗi), và code làm đúng điều AC nói.
2. **Ranh giới ticket.** BE không làm màn hình; UI không sửa `apps/api`, không đổi nghiệp vụ. Không có nghiệp vụ đoán ngoài ticket.
3. **Luật devkit.** Code theo [.devkit/rules/api.md](../rules/api.md) / [.devkit/rules/web.md](../rules/web.md), test theo [.devkit/rules/testing.md](../rules/testing.md), git và PR theo [.devkit/rules/git.md](../rules/git.md). Hạ tầng đã/chưa chọn và dependency trong `.devkit/core.md`.
4. **Interface.** Ticket BE đổi API: input/response khai bằng schema, mã lỗi nghiệp vụ khai bằng `@ApiProblem`, hai file sinh đã commit, `handoff` trỏ đúng path. Đổi bảng: migration sinh bằng `db:generate` đã commit.
5. **Lỗi thật.** Bug, điều kiện biên, xử lý lỗi, bảo mật (lộ dữ liệu, thiếu kiểm quyền), race, test giả (mock lặp lại chính code).
6. **Lệnh kiểm** xanh.

## Kết quả review

Danh sách phát hiện, mỗi dòng: mức (**chặn** / **không chặn**), `file:dòng`, vấn đề, bằng chứng, cách sửa đề xuất. Chặn = sai AC, sai ranh giới, vi phạm luật devkit, bug, lệnh kiểm đỏ. Không có phát hiện chặn thì ghi rõ "không có lỗi chặn".
