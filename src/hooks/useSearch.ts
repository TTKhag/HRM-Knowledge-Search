import { useEffect, useState } from 'react';
import { db } from '../database/db';
import { search } from '../services/searchService';
import type { SearchResult } from '../types';

export function useSearch(query: string, module: string, ext: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) { setResults([]); setError(null); return; }
    setLoading(true);
    (async () => {
      try {
        const hits = await search(query, { module: module || undefined, ext: ext || undefined });
        const [segs, docs] = await Promise.all([
          db.segments.bulkGet(hits.map((h) => h.segmentId)),
          db.documents.bulkGet(Array.from(new Set(hits.map((h) => h.docId)))),
        ]);
        const names = new Map(docs.filter(Boolean).map((d) => [d!.id as number, d!.name]));
        const out: SearchResult[] = [];
        hits.forEach((h, i) => {
          const s = segs[i];
          if (s) out.push({ ...h, docName: names.get(h.docId) ?? '(không rõ)', label: s.label, text: s.text });
        });
        if (!cancelled) { setResults(out); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query, module, ext]);

  return { results, loading, error };
}
