import { Badge, Button, Card, Stack } from '@aar/ui';
import { useEffect, useState } from 'react';
import { api } from './api/client';

type Health = { state: 'loading' } | { state: 'up'; uptimeSeconds: number } | { state: 'down' };

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

  return (
    <main className="min-h-screen bg-background-page p-8">
      <Card
        title="aar-hub"
        headingLevel={2}
        description="Trạng thái API"
        className="mx-auto max-w-md"
        footer={
          <Button variant="secondary" isPending={health.state === 'loading'} onPress={recheck}>
            Kiểm tra lại
          </Button>
        }
      >
        <Stack direction="row" gap={2} align="center">
          {health.state === 'up' && <Badge tone="success">API hoạt động</Badge>}
          {health.state === 'down' && <Badge tone="danger">API không phản hồi</Badge>}
          {health.state === 'loading' && <Badge>Đang kiểm tra</Badge>}
        </Stack>
      </Card>
    </main>
  );
}
