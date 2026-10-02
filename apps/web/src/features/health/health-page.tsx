import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouteRetry } from '../../lib/use-route-retry';
import { Button } from '../../ui/button';
import { healthQuery } from './queries';

/** Health is loaded by the route loader; a failed re-check keeps the last data, so `error` decides the state. */
export function HealthPage() {
  const { error, isFetching, refetch } = useSuspenseQuery(healthQuery());
  return <HealthCard up={error === null} checking={isFetching} onRecheck={() => void refetch()} />;
}

/** The first load failed: the API being down is this screen's answer, not a generic error. */
export function HealthPageError() {
  const retry = useRouteRetry();
  return <HealthCard up={false} checking={false} onRecheck={() => void retry()} />;
}

function HealthCard({ up, checking, onRecheck }: { up: boolean; checking: boolean; onRecheck: () => void }) {
  return (
    <section className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Trạng thái API</h1>
      <p className="mt-4" role="status">
        <span
          className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${up ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
        >
          {up ? 'API hoạt động' : 'API không phản hồi'}
        </span>
      </p>
      <Button className="mt-6" disabled={checking} onClick={onRecheck}>
        Kiểm tra lại
      </Button>
    </section>
  );
}
