import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Highlight from '../components/Highlight';
import { Alert, Badge, ExtBadge, btnSecondary } from '../components/ui';
import { IconBack } from '../components/Icons';
import { getDocument } from '../services/libraryService';
import { errMsg, formatDate, formatSize, queryTerms } from '../utils/text';
import type { DocRecord, SegmentRecord } from '../types';

export default function ViewerPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<{ doc: DocRecord; segments: SegmentRecord[] } | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cursor, setCursor] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const targetSeg = Number(params.get('seg')) || null;

  useEffect(() => {
    getDocument(Number(id)).then(setState).catch((e) => setError(errMsg(e)));
  }, [id]);

  const terms = useMemo(() => queryTerms(q), [q]);

  // Cuộn tới đoạn được chọn từ kết quả tìm kiếm.
  useEffect(() => {
    if (state && targetSeg) document.getElementById(`seg-${targetSeg}`)?.scrollIntoView({ block: 'center' });
  }, [state, targetSeg]);

  const hits = () => Array.from(body.current?.querySelectorAll('mark[data-hit]') ?? []) as HTMLElement[];
  const jump = (dir: 1 | -1) => {
    const list = hits();
    if (!list.length) return;
    const next = (cursor + dir + list.length) % list.length;
    setCursor(next);
    list[next].scrollIntoView({ block: 'center' });
  };

  if (error) return <Alert kind="error">Lỗi: {error}</Alert>;
  if (state === undefined) return <p className="text-sm text-gray-600">Đang tải…</p>;
  if (state === null) return <Alert kind="error">Không tìm thấy tài liệu. <Link className="underline" to="/thu-vien">Về thư viện</Link></Alert>;

  const { doc, segments } = state;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnSecondary + ' flex items-center gap-1'} onClick={() => navigate(-1)}><IconBack className="h-4 w-4" /> Quay lại</button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-navy-800">{doc.name}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <Badge>{doc.module}</Badge> <ExtBadge ext={doc.ext} />
        <span>{formatSize(doc.size)} · {segments.length} đoạn · import {formatDate(doc.importedAt)}</span>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 py-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setCursor(-1); }} placeholder="Tìm trong tài liệu này…"
          className="min-w-[160px] flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none" />
        <button className={btnSecondary} onClick={() => jump(-1)} disabled={!terms.length}>Trước</button>
        <button className={btnSecondary} onClick={() => jump(1)} disabled={!terms.length}>Sau</button>
      </div>

      <div ref={body} className="space-y-3">
        {segments.map((s) => (
          <section key={s.id} id={`seg-${s.id}`} className={`rounded border bg-white p-4 ${s.id === targetSeg ? 'border-navy-600 ring-1 ring-navy-600' : 'border-gray-200'}`}>
            <p className="mb-1 text-xs font-semibold text-navy-700">{s.label}</p>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-900"><Highlight text={s.text} terms={terms} /></p>
          </section>
        ))}
      </div>
    </div>
  );
}
