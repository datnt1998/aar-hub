# `.devkit/`: bộ luật và quy trình code của aar-hub

Đây là nguồn duy nhất quy định cách viết code trong repo, cho người lẫn agent. Lý do và ranh giới với công cụ phụ trợ: [ADR 0001](decisions/0001-devkit-va-cong-cu-phu-tro.md).

## Cách nạp

- `AGENTS.md` ở gốc chứa dòng `@.devkit/core.md`. omp mở rộng dòng đó thành nội dung `core.md` ở đầu mỗi phiên chính, kể cả phiên Ops trong worktree Orca.
- **Subagent không được nạp `AGENTS.md`** (đã thử với omp: subagent chỉ nhận rule, và `@` trong rule không được mở rộng). Vì vậy `.github/instructions/devkit.instructions.md` là rule luôn áp dụng (`applyTo: '**'`), ngắn, bảo agent chưa thấy `core.md` trong context phải đọc `.devkit/core.md` trước khi làm. Không chép luật vào file đó: `core.md` vẫn là nguồn duy nhất.
- `core.md` có bảng định tuyến: việc nào thì đọc file nào trong `rules/` và `workflows/`. Các file đó đọc khi cần, không nạp sẵn.

## Bố cục

| Đường dẫn | Nội dung |
|---|---|
| [core.md](core.md) | Luật lõi luôn nạp: thứ tự ưu tiên, bảng định tuyến, cấu trúc, lệnh, tiêu chí xong, ranh giới ticket |
| `rules/` | Luật theo vùng code: [api](rules/api.md), [web](rules/web.md), [testing](rules/testing.md), [git](rules/git.md) |
| `workflows/` | Quy trình theo việc: [ops-session](workflows/ops-session.md), [ticket-be](workflows/ticket-be.md), [ticket-ui](workflows/ticket-ui.md), [rework](workflows/rework.md), [ci-fix](workflows/ci-fix.md), [review](workflows/review.md) |
| [decisions/](decisions/README.md) | ADR: vì sao chọn như vậy |
| `scripts/` | Script harness: `ac-tests.mjs` (`pnpm ac`), `check.mjs` (`pnpm devkit:check`) |

## Sửa devkit

- Sửa qua PR như code. Luật mới cho nhiều ticket hay đổi quyết định: kèm ADR ([decisions/README.md](decisions/README.md)).
- Ưu tiên ép luật bằng code (helper, lint, test, CI) hơn bằng chữ; file luật ghi luật và trỏ tới chỗ ép.
- Thêm file trong `rules/` hay `workflows/`: thêm dòng vào bảng định tuyến của `core.md`. Thêm ADR: thêm dòng vào danh sách trong `decisions/README.md`.
- `core.md` giữ ngắn (dưới 150 dòng) vì luôn nằm trong context; chi tiết đưa vào `rules/` hay `workflows/`.
- `pnpm devkit:check` kiểm các điều trên (kể cả file rule cho subagent) và chạy trong `pnpm lint` (CI).

## Công cụ phụ trợ (AgentKit)

AgentKit cài theo máy, trong checkout của từng người (`.omp/`, `.agentkit/`, khối `AGENTKIT` trong `AGENTS.md`), không commit. Sau khi `ak` ghi khối vào `AGENTS.md`, file này có thay đổi cục bộ: đừng commit phần đó. `git pull` báo vướng `AGENTS.md` thì `git stash`, pull, rồi `git stash pop`.
