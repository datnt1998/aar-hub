# Sửa theo review

Làm trên branch và PR đang có; không mở PR mới.

1. **Đọc góp ý.** Góp ý trong message của Ops, hoặc trên PR: `gh pr view --comments` và review thread (`gh api repos/{owner}/{repo}/pulls/<số>/comments`). Liệt kê từng góp ý thành một dòng việc.
2. **Phân loại.** Mỗi góp ý: sửa, hoặc không sửa kèm lý do có bằng chứng (code, test, ticket). Góp ý đổi nghiệp vụ so với ticket là câu hỏi cho người, không tự làm.
3. **Sửa** theo quy trình của loại ticket ([.devkit/workflows/ticket-be.md](ticket-be.md) hay [.devkit/workflows/ticket-ui.md](ticket-ui.md)), từ bước code. Mỗi lỗi hành vi có test bắt được nó.
4. **Kiểm, review độc lập, commit** như quy trình ticket. Chỉ thêm commit mới, không force-push.
5. **Trả lời.** Ghi trong PR (comment) từng góp ý: đã sửa ở commit nào, hoặc vì sao không sửa. Khi Ops gọi: ghi result theo [.devkit/workflows/ops-session.md](ops-session.md).
