# Luật code `apps/web`

## Gọi API

- Giao diện chỉ gọi API qua `api` trong `apps/web/src/api/client.ts`: `api.GET('/api/health')`, `api.POST(...)`. Path và body có type từ `schema.gen.ts`.
- Không viết `fetch` tay, không khai lại type của API. Endpoint mới do ticket BE thêm và chạy `pnpm openapi`; ticket UI dùng ngay `api.<METHOD>('<path>')`.
- `src/api/schema.gen.ts` là file sinh, không sửa tay.

## Giao diện

- Màn hình viết bằng React + class Tailwind trong `apps/web/src`. Chưa có thư viện component dùng chung; không tự thêm thư viện UI.
- CSS gốc là `apps/web/src/index.css` (`@import "tailwindcss"`).
- Chữ trên giao diện bằng tiếng Việt.
