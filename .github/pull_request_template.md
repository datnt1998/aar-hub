## Ticket

<!-- Mã ticket và use case, ví dụ: FEAT-PARTNER-ONBOARDING / BE-01 · UC-PARTNER-ONBOARDING-01. PR không theo ticket: ghi mục đích. -->

## Thay đổi

<!-- 2–5 dòng về hành vi mới. Không kể lại diff. -->

## AC

<!-- Dán output `pnpm ac <tiền tố AC của ticket>`. AC chưa đạt: ghi lý do (spec_gap / câu hỏi). Không theo ticket: ghi "Không". -->

## Interface

<!-- Ticket BE: endpoint/DTO thêm hoặc đổi, kèm path trong apps/api/openapi.json. Không đổi: ghi "Không". -->

## Quyết định và câu hỏi

<!-- Dependency mới, ADR (.devkit/decisions/), câu hỏi không chặn. Không có: ghi "Không". -->

## Đã chạy

- [ ] `pnpm verify` (format:check, lint, typecheck, test, e2e, build, openapi:check)
- [ ] Review độc lập (subagent `reviewer` hoặc session riêng, theo `.devkit/workflows/review.md`)
- [ ] `.devkit/` (luật, ADR) đã cập nhật nếu đổi quy ước hoặc quyết định
