import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Highlight from '../components/Highlight';
import { Alert, Badge, ExtBadge, btnSecondary } from '../components/ui';
import { IconBack } from '../components/Icons';
import type { ViewTarget } from '../components/viewers/types';
import { getDocument, getOriginal } from '../services/libraryService';
import { parseLocation } from '../utils/location';
import { errMsg, formatDate, formatSize, normalize, queryTerms } from '../utils/text';
import type { DocRecord, SegmentRecord } from '../types';

const PdfViewer = lazy(() => import('../components/viewers/PdfViewer'));
const DocxViewer = lazy(() => import('../components/viewers/DocxViewer'));
const XlsxViewer = lazy(() => import('../components/viewers/XlsxViewer'));

type Mode = 'original' | 'text';

export default function ViewerPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<{ doc: DocRecord; segments: SegmentRecord[] } | null | undefined>();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [notice, setNotice] = useState<string | null>(null);
  const [target, setTarget] = useState<ViewTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [nav, setNav] = useState({ index: -1, total: 0 });
  const body = useRef<HTMLDivElement>(null);
  const targetSeg = Number(params.get('seg')) || null;

  useEffect(() => {
    let cancelled = false;
    setState(undefined); setBlob(null); setNotice(null); setTarget(null); setError(null);
    Promise.all([getDocument(Number(id)), getOriginal(Number(id))])
      .then(([st, b]) => {
        if (cancelled) return;
        setState(st);
        setBlob(b);
        if (st && b && st.doc.ext !== 'txt') setMode('original'); else setMode('text');
        const seg = st?.segments.find((s) => s.id === targetSeg);
        if (seg) setTarget({ ...parseLocation(seg.label), text: seg.text, nonce: 1 });
      })
      .catch((e) => { if (!cancelled) setError(errMsg(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const terms = useMemo(() => queryTerms(q), [q]);
  useEffect(() => setNav({ index: -1, total: 0 }), [q, mode]);

  // Chế độ văn bản: cuộn tới đoạn được chọn từ kết quả tìm kiếm.
  useEffect(() => {
    if (state && targetSeg && mode === 'text') document.getElementById(`seg-${targetSeg}`)?.scrollIntoView({ block: 'center' });
  }, [state, targetSeg, mode]);

  const ext = state?.doc.ext;
  const domNav = mode === 'text' || ext === 'docx';
  const matchSegs = useMemo(() => {
    if (!state || !terms.length || domNav) return [];
    return state.segments.filter((s) => { const n = normalize(s.text); return terms.some((t) => n.includes(t)); });
  }, [state, terms, domNav]);

  const jump = (dir: 1 | -1) => {
    const pick = (total: number) => (nav.index < 0 ? (dir === 1 ? 0 : total - 1) : (nav.index + dir + total) % total);
    if (domNav) {
      const list = Array.from(body.current?.querySelectorAll('[data-hit]') ?? []) as HTMLElement[];
      if (!list.length) { setNav({ index: -1, total: 0 }); return; }
      const next = pick(list.length);
      setNav({ index: next, total: list.length });
      list[next].scrollIntoView({ block: 'center' });
    } else {
      if (!matchSegs.length) return;
      const next = pick(matchSegs.length);
      const s = matchSegs[next];
      setNav({ index: next, total: matchSegs.length });
      setTarget({ ...parseLocation(s.label), text: s.text, nonce: Date.now() });
    }
  };

  const onViewerError = (msg: string) => {
    setNotice(`Không hiển thị được bản gốc (${msg}). Đang hiển thị nội dung trích xuất.`);
    setMode('text');
  };

  if (error) return <Alert kind="error">Lỗi: {error}</Alert>;
  if (state === undefined) return <p className="text-sm text-gray-600">Đang tải…</p>;
  if (state === null) return <Alert kind="error">Không tìm thấy tài liệu. <Link className="underline" to="/thu-vien">Về thư viện</Link></Alert>;

  const { doc, segments } = state;
  const canOriginal = !!blob && doc.ext !== 'txt';
  const viewerProps = blob ? { blob, terms, target, onError: onViewerError } : null;

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

      {!blob && doc.ext !== 'txt' && (
        <Alert kind="info">Tài liệu này được import trước khi có tính năng lưu file gốc nên chỉ xem được nội dung trích xuất. Import lại đúng file này để bổ sung bản gốc (không tạo tài liệu trùng).</Alert>
      )}
      {notice && <Alert kind="error">{notice}</Alert>}

      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 py-2">
        {doc.ext !== 'txt' && (
          <div className="flex overflow-hidden rounded border border-gray-300 text-sm">
            <button disabled={!canOriginal} onClick={() => { setNotice(null); setMode('original'); }}
              className={`px-3 py-2 ${mode === 'original' ? 'bg-navy-700 text-white' : 'bg-white text-gray-700 disabled:text-gray-400'}`}>Bản gốc</button>
            <button onClick={() => setMode('text')} className={`px-3 py-2 ${mode === 'text' ? 'bg-navy-700 text-white' : 'bg-white text-gray-700'}`}>Văn bản trích xuất</button>
          </div>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong tài liệu này…"
          className="min-w-[160px] flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none" />
        <button className={btnSecondary} onClick={() => jump(-1)} disabled={!terms.length}>Trước</button>
        <button className={btnSecondary} onClick={() => jump(1)} disabled={!terms.length}>Sau</button>
        {nav.total > 0 && <span className="text-xs text-gray-600">{nav.index + 1}/{nav.total}</span>}
      </div>

      <div ref={body}>
        {mode === 'original' && viewerProps ? (
          <Suspense fallback={<p className="text-sm text-gray-600">Đang tải trình xem…</p>}>
            {doc.ext === 'pdf' && <PdfViewer key={id} {...viewerProps} />}
            {doc.ext === 'docx' && <DocxViewer key={id} {...viewerProps} />}
            {doc.ext === 'xlsx' && <XlsxViewer key={id} {...viewerProps} />}
          </Suspense>
        ) : (
          <div className="space-y-3">
            {segments.map((s) => (
              <section key={s.id} id={`seg-${s.id}`} className={`rounded border bg-white p-4 ${s.id === targetSeg ? 'border-navy-600 ring-1 ring-navy-600' : 'border-gray-200'}`}>
                <p className="mb-1 text-xs font-semibold text-navy-700">{s.label}</p>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-900"><Highlight text={s.text} terms={terms} /></p>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
