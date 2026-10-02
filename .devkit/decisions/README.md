# Quyết định kỹ thuật (ADR)

Mỗi quyết định kỹ thuật bền vững là một file `NNNN-<tên-ngắn>.md` trong thư mục này, theo mẫu MADR rút gọn bên dưới. Code và luật trong `.devkit/rules/` làm theo ADR; ADR giải thích **vì sao**.

## Khi nào cần ADR

- Chọn hay đổi stack, database, ORM, auth, hạ tầng, thư viện runtime.
- Đặt một contract dùng chung cho nhiều ticket (kiểu lỗi, validation, cấu trúc module, quy ước test).
- Đổi hay bỏ một ADR cũ: viết ADR mới, ghi `Thay thế: NNNN`, và đổi trạng thái ADR cũ thành `Bị thay thế bởi NNNN`. Không sửa nội dung quyết định của ADR đã chấp nhận.

Agent không tự chấp nhận ADR: soạn ADR ở trạng thái `Đề xuất` trong PR; người duyệt merge thì thành `Chấp nhận`.

## Danh sách

| Số | Quyết định | Trạng thái |
|---|---|---|
| [0001](0001-devkit-va-cong-cu-phu-tro.md) | `.devkit/` là bộ luật duy nhất; AgentKit chỉ là công cụ phụ trợ, không commit | Chấp nhận |

## Mẫu

```markdown
# NNNN. <Quyết định, dạng câu khẳng định>

- Trạng thái: Đề xuất | Chấp nhận | Bị thay thế bởi NNNN
- Ngày: YYYY-MM-DD
- Người quyết định: <tên>

## Bối cảnh

<Vấn đề, ràng buộc, bằng chứng.>

## Các lựa chọn

1. <Lựa chọn A>: ưu, nhược, hỏng trước tiên khi nào.
2. <Lựa chọn B>: …

## Quyết định

<Chọn gì, vì sao.>

## Hệ quả

<Được gì, mất gì, việc phải làm theo, điều kiện để xem lại.>
```
