# Luật code `apps/web`

Lý do: [ADR 0005](../decisions/0005-nen-tang-web.md). Mẫu tham chiếu: `src/routes/index.tsx` + `src/features/health/` (đọc dữ liệu), `src/lib/apply-problem.test.tsx` (form và lỗi API).

## Cấu trúc

```
src/
  main.tsx              chỉ tạo QueryClient, router và render App
  app/                  query-client.ts, router.tsx, app.tsx, route-states.tsx (lỗi/không tìm thấy/đang tải mặc định)
  routes/               route theo file (TanStack Router), mỏng: path, validateSearch, loader, component
  routeTree.gen.ts      file sinh, có commit, không sửa tay
  features/<miền>/      queries.ts, <màn-hình>.tsx, <màn-hình>.test.tsx, form của miền
  ui/                   thành phần trình bày dùng chung: Button, TextField, FormAlert
  lib/                  messages.ts (code → tiếng Việt), apply-problem.ts, format.ts, use-route-retry.ts
  api/                  client.ts (api, $api), problem.ts, schema.gen.ts
  test/                 setup.ts, server.ts (MSW), render.tsx (renderRoute)
```

- Thư mục `features/` chia theo miền nghiệp vụ (`partners`, `invitations`), không theo ticket. Feature được import `api`, `ui`, `lib`; không import feature khác (code dùng chung chuyển vào `ui` hoặc `lib`).
- `ui/` không import `api`, `app`, `features`, `routes` hay `@tanstack/*` (lint chặn).
- Thêm màn hình: thêm file trong `src/routes/` (đường dẫn tiếng Anh, kebab-case, khớp tài nguyên của API: `/partners`, `/partners/$partnerId`). Plugin Vite tự sinh `routeTree.gen.ts` khi chạy dev/build/test; `pnpm --filter web routes` sinh lại tay. Xung đột ở `routeTree.gen.ts`: lấy bên nào cũng được rồi sinh lại.
- Link và điều hướng dùng `<Link to="/partners/$partnerId" params={...}>` / `useNavigate()`; đường dẫn sai là lỗi typecheck. Search param khai bằng `validateSearch` với schema Zod.

## Gọi API

- Chỉ qua `src/api/client.ts`: `$api` (TanStack Query) cho màn hình, `api` cho lệnh gọi một lần. Lint cấm `fetch` và `openapi-fetch` ngoài `src/api/`. Không khai lại type của API; endpoint mới do ticket BE thêm và chạy `pnpm openapi`.
- **Đọc:** mỗi feature có `queries.ts` xuất hàm trả `$api.queryOptions('get', '<path>', { params })`. Loader của route gọi `context.queryClient.query({ ...q, staleTime: 'static' })`; màn hình gọi `useSuspenseQuery(q)` với cùng `q`. Không đọc dữ liệu trong `useEffect`.
- **Ghi:** `$api.useMutation('post', '<path>', { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['get', '<path danh sách>'] }) })`. Trả về promise của `invalidateQueries` để nút còn ở trạng thái chờ đến khi danh sách tải lại. Không cập nhật lạc quan.
- Lỗi API luôn là `Problem` (`status`, `code`, `errors?`), kể cả khi máy chủ trả lỗi không đúng dạng (`code: 'UNEXPECTED_RESPONSE'`). Lỗi mạng là `TypeError`, không phải Problem.

## Lỗi và thông điệp

- Không hiển thị `detail` của API (tiếng Anh, cho developer). Câu cho người dùng lấy từ `code` qua `problemMessage(error, messages)` trong `src/lib/messages.ts`: mã riêng của màn hình truyền qua `messages` (`{ INVITATION_EXPIRED: 'Lời mời đã hết hạn.' }`), mã chung (`NOT_FOUND`, `FORBIDDEN`…) đã có sẵn.
- Mã lỗi màn hình phải xử lý là các mã ticket BE khai bằng `@ApiProblem` (có trong `schema.gen.ts`). Mã thiếu trong interface là câu hỏi cho ticket BE.
- Lỗi khi tải route: `errorComponent` mặc định (`app/route-states.tsx`) hiện thông điệp và nút "Thử lại". Route có trạng thái lỗi riêng thì khai `errorComponent` và dùng `useRouteRetry()`.
- Lỗi khi gửi form: `applyProblem(error, setError, [các trường], messages)` trong `onError` của mutation hoặc sau `mutateAsync`; lỗi theo trường hiện dưới trường, phần còn lại hiện ở `FormAlert` (`formState.errors.root?.server?.message`).

## Form

- react-hook-form + Zod (`zodResolver`). Schema phía client chỉ kiểm điều làm trải nghiệm tốt hơn (bắt buộc, định dạng); API vẫn là nơi quyết định.
- Trường nhập dùng `TextField` với `{...register('owner.email')}`; tên trường trùng đường dẫn trong body request để `applyProblem` gắn lỗi đúng chỗ (`/body/owner/email` → `owner.email`).

## Giao diện

- React + class Tailwind. Không thêm thư viện component; control (nút, ô nhập, thông báo) chỉ dùng `src/ui`. Màn hình được dùng class bố cục và chữ (`flex`, `gap-*`, `p-*`, `text-sm`); màu, viền, bo góc, focus của control chỉ nằm trong `src/ui`. Thêm primitive mới khi màn hình cần (`Select`, `Dialog`), props là props gốc của phần tử HTML.
- Chữ trên giao diện bằng tiếng Việt, viết thẳng trong code (không thư viện i18n). Ngày giờ và số qua `src/lib/format.ts` (`vi-VN`, múi giờ `Asia/Ho_Chi_Minh`), không gọi `toLocaleString()` trực tiếp.
- Mỗi màn hình có một `<h1>`; control có nhãn truy cập được (label, tên nút). E2E quét axe mỗi màn hình (`expectAccessible()`).
- CSS gốc là `src/index.css` (`@import "tailwindcss"`). Chưa khai `@theme` riêng.
