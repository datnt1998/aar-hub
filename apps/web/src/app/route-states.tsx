import { type ErrorComponentProps, Link } from '@tanstack/react-router';
import { problemMessage } from '../lib/messages';
import { useRouteRetry } from '../lib/use-route-retry';
import { Button } from '../ui/button';

/** Default screen when a route loader or a suspense query fails. Routes may set their own `errorComponent`. */
export function RouteError({ error }: ErrorComponentProps) {
  const retry = useRouteRetry();
  return (
    <section role="alert" className="flex flex-col items-start gap-4">
      <p className="text-sm text-slate-800">{problemMessage(error)}</p>
      <Button onClick={() => void retry()}>Thử lại</Button>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Không tìm thấy trang</h1>
      <Link to="/" className="text-sm font-medium text-slate-900 underline">
        Về trang chủ
      </Link>
    </section>
  );
}

export function Pending() {
  return (
    <p role="status" className="text-sm text-slate-600">
      Đang tải…
    </p>
  );
}
