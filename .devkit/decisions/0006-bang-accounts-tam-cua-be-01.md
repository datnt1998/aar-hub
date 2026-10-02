# 0006. Bảng `accounts` là bản tạm của BE-01; ticket đăng nhập tiếp quản

- Trạng thái: Đề xuất
- Ngày: 2026-10-02
- Người quyết định: Đạt (duyệt PR)

## Bối cảnh

- AC-PARTNER-ONBOARDING-01-10: mọi admin nền tảng nhận email và thông báo trong AarHub khi có đơn mới. Cần biết ai là admin và gắn thông báo trong AarHub vào một tài khoản.
- aar-docs chốt (Q-PARTNER-ONBOARDING-144): tài khoản admin thuộc ticket đăng nhập chung, không thuộc BE-01. Repo chưa chọn auth.
- aar-docs trả lời Q-PARTNER-ONBOARDING-145 chỉ bằng "Đồng ý" cho câu hỏi hai vế (giữ danh sách admin tạm hay bỏ việc báo admin), nên chưa rõ chọn vế nào. Q-PARTNER-ONBOARDING-146 làm rõ: BE-01 giữ bảng `accounts` tạm theo ADR này để báo mọi admin có đơn mới (AC-01-10); ticket đăng nhập chung (Q-PARTNER-ONBOARDING-141 A) sau này tiếp quản bảng đó cùng khóa ngoại `notifications.account_id`; đây là làm rõ, không đổi spec v5. Chấp nhận ADR vẫn thuộc người duyệt PR: merge PR là chấp nhận ADR.
- Không có bảng nào thì AC-01-10 không kiểm được bằng test HTTP trên database thật, và `notifications.account_id` không có chỗ để trỏ tới.

## Các lựa chọn

1. **Giữ bảng `accounts` tối thiểu (`id`, `email`, `is_platform_admin`) trong migration của BE-01, ghi rõ là tạm.** Ưu: AC-01-10 có test thật, không thêm dependency, không chọn auth. Nhược: sau khi merge bảng rỗng nên chưa admin nào được báo; ticket đăng nhập phải viết migration tiếp quản.
2. **Bỏ bảng; BE-01 báo `spec_gap` cho AC-01-10 và chờ ticket đăng nhập.** Ưu: không có bảng đoán trước. Nhược: AC-01-10 không có test, mất cả phần thông báo cho admin, khóa ngoại của `notifications` phải thêm sau.
3. **Cổng (interface) đọc danh sách admin, không có bảng.** Nhược: chỉ có một cài đặt giả, trái luật không dựng lớp trừu tượng khi chưa có cài đặt thứ hai; test vẫn không chạm database.

## Quyết định

Chọn 1. Bảng `accounts` chỉ là chỗ đọc tạm: chỉ `PartnerApplicationsRepository.findPlatformAdmins` đọc nó, và không có API nào ghi vào.

## Hệ quả

- Ticket đăng nhập tiếp quản bảng `accounts` và khóa ngoại `notifications.account_id`: viết migration đổi hoặc thay bảng, chuyển dữ liệu, và sửa `findPlatformAdmins` nếu vai trò admin đổi chỗ lưu.
- Cho đến khi đó, AC-01-10 chỉ được chứng minh với admin chèn tay vào database; chưa có cách tạo admin trên môi trường thật.
- Bảng `partners` cũng là bản tạm: BE-01 không đọc hay ghi bảng này, nó chỉ có để test AC-01-11. Cột và giá trị `status` là đoán; ticket đối tác tiếp quản bảng `partners` cùng các cột của nó (đổi hoặc thay bằng migration của ticket đó).
- Người duyệt từ chối ADR này thì BE-01 chuyển sang lựa chọn 2: bỏ `accounts` và `notifications.account_id` khỏi migration, báo `spec_gap` cho AC-01-10.
