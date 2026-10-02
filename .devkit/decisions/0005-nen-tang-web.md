# 0005. Nền tảng web: TanStack Router + Query, react-hook-form, MSW có type

- Trạng thái: Chấp nhận
- Ngày: 2026-10-02
- Người quyết định: Đạt

## Bối cảnh

- `apps/web` mới có một màn hình đọc dữ liệu bằng `useEffect` + `useState`, nuốt mọi lỗi thành "down". Chưa có router, cache dữ liệu, form, hay cách hiện lỗi API.
- Ticket UI sắp tới: danh sách, chi tiết, form tạo và chuyển trạng thái (lời mời, đối tác). Agent đổi tên và chuyển màn hình thường xuyên; link hay tham số sai nên đỏ ở typecheck, không đợi tới lúc chạy.
- API trả lỗi dạng Problem có `code` và `errors[].pointer` ([ADR 0004](0004-hop-dong-http-cua-api.md)); giao diện dịch `code` sang tiếng Việt.
- Test component cũ thay `fetch` bằng stub trả `any`, phụ thuộc thứ tự import.
- `@aar/ui` (thư viện component chung) sẽ tới sau; `core.md` cấm tự thêm thư viện UI.

## Các lựa chọn

1. **Router:** TanStack Router theo file (link, params, search có type lúc compile; một file sinh `routeTree.gen.ts`), React Router 8 data mode (link không có type), React Router 8 framework mode (có type nhưng thay CLI của Vite, thêm quy ước `app/`).
2. **Dữ liệu server:** `useEffect` (mỗi màn tự xử lý race và cache), TanStack Query với `queryFn` viết tay, TanStack Query + `openapi-react-query` (key và type sinh từ schema).
3. **Form:** react-hook-form + Zod, TanStack Form (mỗi ô nhập một render-prop, dài hơn), `<form action>` của React 19 (xoá dữ liệu người dùng đã nhập sau mỗi lần gửi, kể cả khi lỗi).
4. **Test component:** stub `fetch`, MSW với handler có type theo schema (`openapi-msw`).

## Quyết định

- TanStack Router theo file, `routeTree.gen.ts` có commit; loader đọc qua TanStack Query (`queryClient.query({ ...q, staleTime: 'static' })`), màn hình dùng `useSuspenseQuery` với cùng options. Lỗi khi tải là `errorComponent` của route (mặc định ở `app/route-states.tsx`).
- `openapi-react-query` (`$api`) trên client `openapi-fetch` sẵn có. Middleware của client biến mọi phản hồi lỗi thành Problem giữ `status` (phản hồi không đúng dạng thành `UNEXPECTED_RESPONSE`), vì `openapi-fetch` coi lỗi không có body là thành công. Query không thử lại khi lỗi 4xx. Ghi xong thì `invalidateQueries`, không cập nhật lạc quan.
- react-hook-form 7 + Zod; `applyProblem()` gắn `errors[].pointer` của body vào trường, phần còn lại thành một thông báo của form. Câu tiếng Việt lấy từ `code` (`src/lib/messages.ts`).
- Primitive giao diện mỏng trong `src/ui` (Button, TextField, FormAlert) với props gốc của HTML; chỉ `src/ui` quyết định màu và kiểu của control, để đổi sang `@aar/ui` chỉ phải sửa thư mục này.
- MSW 3 + `openapi-msw` cho test component, dựng màn hình qua route thật (`renderRoute`). Playwright quét axe (WCAG 2.1 AA) mỗi màn hình. Lint: `eslint-plugin-testing-library`, `eslint-plugin-playwright`, và ranh giới import (không `fetch`/`openapi-fetch` ngoài `src/api`; `src/ui` không import dữ liệu hay router).
- Tách tsconfig: `tsconfig.app.json` cho code chạy trên trình duyệt (không có type Node, nên `process.env` trong `src` là lỗi typecheck), `tsconfig.node.json` cho cấu hình và e2e.
- Chỉ tiếng Việt: không thư viện i18n; ngày giờ theo `vi-VN` và múi giờ `Asia/Ho_Chi_Minh` cố định (CI chạy UTC).

## Hệ quả

- Đường dẫn, tham số route, path API, body và fixture test lệch nhau đều đỏ ở `pnpm typecheck`.
- Thêm màn hình là thêm một file route mỏng và một thư mục feature; xung đột chỉ ở file sinh, sinh lại là xong.
- Phụ thuộc mới đáng theo dõi: `openapi-react-query` 0.x (khoá theo `openapi-fetch` ^0.17, nâng cùng nhau), MSW 3 (mới; nếu lỗi thì lùi về 2.x, chỉ đổi tên `onUnhandledFrame` ↔ `onUnhandledRequest`), react-hook-form 8 đang beta (giữ cách dùng `useForm`/`register`/`setError` để nâng dễ).
- Xem lại khi có điều kiện:
  - Chọn auth → xử lý 401 ở đúng một chỗ (cache `onError` hoặc middleware) và layout `_authed` với `beforeLoad`.
  - Biến môi trường `VITE_*` đầu tiên → khai type `ImportMetaEnv` trong `src/vite-env.d.ts`.
  - Từ 4 thư mục feature, hoặc review bắt được import chéo feature → `eslint-plugin-boundaries`.
  - `@aar/ui` phát hành → thay nội dung `src/ui`.
  - Ngôn ngữ thứ hai → chọn thư viện i18n.
