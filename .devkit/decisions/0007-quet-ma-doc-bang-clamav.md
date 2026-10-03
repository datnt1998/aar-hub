# 0007. Quét mã độc tệp đính kèm bằng ClamAV (clamd) qua TCP; lỗi nghiệp vụ được chỉ input và có 503

- Trạng thái: Đề xuất
- Ngày: 2026-10-02
- Người quyết định: Đạt (duyệt PR)

## Bối cảnh

- BE-22 (BR-PARTNER-ONBOARDING-038): hệ thống quét mã độc từng tệp đính kèm ngay khi nhận đơn, người nộp đơn chờ kết quả. Tệp nhiễm thì không nhận đơn; quét lỗi hoặc không phản hồi thì không nhận đơn và người nộp đơn thử lại sau. BE-25 (bổ sung hồ sơ) dùng cùng luật.
- Repo chưa có dịch vụ quét nào. Kết quả quét quyết định đơn có được nhận hay không, nên phải quét đồng bộ trong request, không xếp hàng như email (BE-01).
- Hồ sơ là giấy tờ pháp nhân; gửi ra dịch vụ bên thứ ba là chuyển dữ liệu của người nộp đơn ra ngoài.
- Hợp đồng lỗi ([ADR 0004](0004-hop-dong-http-cua-api.md)) chỉ có `errors[]` cho 400 `VALIDATION_FAILED`, và `DomainError` chỉ có 404/403/409/422. Ticket cần (1) chỉ ra tệp nào bị từ chối vì mã độc ("người nhập thấy trường sai cùng lý do") và (2) một lỗi tạm thời "thử lại sau" khác với lỗi do dữ liệu.

## Các lựa chọn

1. **ClamAV tự chạy (clamd), API nói giao thức `INSTREAM` qua TCP bằng `node:net`.** Ưu: mã nguồn mở, dữ liệu không ra ngoài, không thêm thư viện npm, test được bằng clamd giả nói đúng giao thức. Nhược: phải chạy thêm một dịch vụ (RAM ~1–2 GB cho bộ nhận dạng), cập nhật bộ nhận dạng (`freshclam`). Hỏng trước tiên khi clamd chết hoặc quá tải: đơn có tệp bị từ chối với 503 cho tới khi clamd chạy lại.
2. **Thư viện npm cho clamd (`clamscan`, `clamdjs`).** Như 1 nhưng thêm dependency runtime chỉ để bọc một giao thức vài dòng.
3. **Dịch vụ quét trên mạng (VirusTotal, Cloudmersive, quét của nhà cung cấp cloud).** Ưu: không vận hành. Nhược: gửi giấy tờ pháp nhân ra bên thứ ba, cần khóa API và hợp đồng, độ trễ và hạn mức ngoài tầm kiểm soát.
4. **Chưa quét, nhận đơn rồi quét sau.** Trái BR-PARTNER-ONBOARDING-038 (người nộp đơn chờ kết quả, đơn có tệp nhiễm không được nhận).

## Quyết định

- Chọn 1. `MalwareScanner` (`apps/api/src/malware-scan/`) gửi nội dung tệp tới clamd bằng `zINSTREAM` và đọc một trong ba kết quả: `clean`, `infected`, `failed` (không kết nối được, trả `ERROR`, đóng kết nối, quá `MALWARE_SCAN_TIMEOUT_MS`). Không bao giờ ném lỗi; `failed` nghĩa là tệp không được nhận.
- Cấu hình: `CLAMAV_HOST` (mặc định `127.0.0.1`), `CLAMAV_PORT` (3310), `MALWARE_SCAN_TIMEOUT_MS` (30000). Không có clamd thì mọi đơn có tệp nhận 503, không bao giờ nhận tệp chưa quét.
- Test HTTP chạy `MalwareScanner` thật trỏ tới clamd giả (`apps/api/test/support/fake-clamd.ts`), nói đúng giao thức và giả được bốn tình huống: sạch/nhiễm (theo chuỗi EICAR), `ERROR`, im lặng, đóng kết nối.
- Hợp đồng lỗi mở rộng (bổ sung ADR 0004, không thay):
  - `DomainError` nhận `errors?: FieldError[]` để chỉ input mà lỗi nghiệp vụ nói tới, cùng dạng `errors[]` của `VALIDATION_FAILED`; `code` của từng phần tử là lý do route khai (`infected`, `not_scanned`).
  - Thêm `kind: 'unavailable'` → 503: dịch vụ mà luật nghiệp vụ cần không trả lời; cùng request có thể qua khi thử lại.

## Hệ quả

- Hạ tầng deploy (chưa chọn) phải chạy clamd cạnh API, có `freshclam` cập nhật bộ nhận dạng, và đặt `CLAMAV_HOST`/`CLAMAV_PORT`. `StreamMaxLength` của clamd (mặc định 25 MB) phải lớn hơn 10 MB.
- Chạy local: `docker run -d -p 3310:3310 clamav/clamav-debian` (có bản arm64); không có clamd thì nộp đơn trả 503.
- BE-25 dùng lại `MalwareScanModule` và hai lỗi trên.
- Người duyệt từ chối ADR này: thay `MalwareScanner` bằng cài đặt theo lựa chọn khác; route, mã lỗi và test HTTP không đổi, chỉ đổi clamd giả.
- Xem lại khi: thêm loại tệp lớn hơn (`StreamMaxLength`), cần quét bất đồng bộ, hoặc chọn hạ tầng cloud có dịch vụ quét tại chỗ.
