import { useEffect, useState } from 'react';
import { api } from './api/client';

type Health = { state: 'loading' } | { state: 'up'; uptimeSeconds: number } | { state: 'down' };

const STATUS = {
  loading: { label: 'Đang kiểm tra', className: 'bg-slate-100 text-slate-700' },
  up: { label: 'API hoạt động', className: 'bg-emerald-100 text-emerald-800' },
  down: { label: 'API không phản hồi', className: 'bg-red-100 text-red-800' },
} as const;

async function fetchHealth(): Promise<Health> {
  const { data } = await api.GET('/api/health').catch(() => ({ data: undefined }));
  return data?.status === 'ok' ? { state: 'up', uptimeSeconds: data.uptimeSeconds } : { state: 'down' };
}

export function App() {
  const [health, setHealth] = useState<Health>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    void fetchHealth().then((next) => active && setHealth(next));
    return () => {
      active = false;
    };
  }, []);

  const recheck = () => {
    setHealth({ state: 'loading' });
    void fetchHealth().then(setHealth);
  };

  const status = STATUS[health.state];

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">aar-hub</h2>
        <p className="mt-1 text-sm text-slate-600">Trạng thái API</p>
        <p className="mt-4">
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${status.className}`}>{status.label}</span>
        </p>
        <button
          type="button"
          className="mt-6 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          disabled={health.state === 'loading'}
          onClick={recheck}
        >
          Kiểm tra lại
        </button>
      </section>
    </main>
  );
}
