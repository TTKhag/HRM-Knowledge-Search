import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';

/** Theo dõi truy vấn IndexedDB và tự cập nhật khi dữ liệu thay đổi. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; error: string | null } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => { setData(v); setError(null); },
      error: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}
