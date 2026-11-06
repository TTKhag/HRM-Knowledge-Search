import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Highlight from '../components/Highlight';
import { Alert, Badge, ExtBadge, btnSecondary } from '../components/ui';
import { IconBack } from '../components/Icons';
import type { OccCtx, ViewTarget } from '../components/viewers/types';
import { getDocument, getOriginal } from '../services/libraryService';
import { findRuns, minRunFor, tokenize, type TokMode } from '../utils/ranking';
import { parseLocation } from '../utils/location';
import { errMsg, formatDate, formatSize } from '../utils/text';
import type { DocRecord, SegmentRecord } from '../types';

const PdfViewer = lazy(() => import('../components/viewers/PdfViewer'));
const DocxViewer = lazy(() => import('../components/viewers/DocxViewer'));
const XlsxViewer = lazy(() => import('../components/viewers/XlsxViewer'));

type Mode = 'original' | 'text';
const CTX = 6;

interface OccInfo { seg: SegmentRecord; occ: number }

export default function ViewerPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<{ doc: DocRecord; segments: SegmentRecord[] } | null | undefined>();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [notice, setNotice] = useState<string | null>(null);
  const [jumpTarget, setJumpTarget] = useState<ViewTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [nav, setNav] = useState({ index: -1, total: 0 });
  const body = useRef<HTMLDivElement>(null);
  const targetSeg = Number(params.get('seg')) || null;
  const urlOcc = params.get('occ') === null ? undefined : Number(params.get('occ'));
  const urlLen = Number(params.get('len')) || 0;

  useEffect(() => {
    let cancelled = false;
    setState(undefined); setBlob(null); setNotice(null); setJumpTarget(null); setError(null);
    Promise.all([getDocument(Number(id)), getOriginal(Number(id))])
      .then(([st, b]) => {
        if (cancelled) return;
        setState(st);
        setBlob(b);
        if (st && b && st.doc.ext !== 'txt') setMode('original'); else setMode('text');
      })
      .catch((e) => { if (!cancelled) setError(errMsg(e)); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => setNav({ index: -1, total: 0 }), [q, mode]);

  const ext = state?.doc.ext;
  const tmode: TokMode = ext === 'pdf' ? 'wrap' : 'text';
  const qn = useMemo(() => tokenize(q, 'query').map((t) => t.norm), [q]);

  // Số từ liền nhau dài nhất của truy vấn trong tài liệu này (dùng khi mở tài liệu mà không đến từ một kết quả cụ thể).
  const docBest = useMemo(() => {
    if (!state || !qn.length) return 0;
    let best = 0;
    for (const s of state.segments) for (const r of findRuns(qn, tokenize(s.text, tmode), minRunFor(qn.length))) best = Math.max(best, r.len);
    return best;
  }, [state, qn, tmode]);

  // Mở từ kết quả tìm kiếm và chưa sửa truy vấn: tô sáng đúng độ dài chuỗi của kết quả đó.
  const minLen = Math.max(1, urlLen > 0 && q === initialQ ? urlLen : docBest);

  // Mọi lần xuất hiện (theo thứ tự tài liệu) + ngữ cảnh các từ liền trước/sau để định vị trong bản gốc DOCX.
  const occs = useMemo(() => {
    const list: OccInfo[] = [];
    const ctx: OccCtx[] = [];
    if (!state || !qn.length) return { list, ctx };
    const stream: string[] = [];
    const found: { seg: SegmentRecord; occ: number; tokStart: number; tokEnd: number; text: string }[] = [];
    for (const s of state.segments) {
      const toks = tokenize(s.text, tmode);
      const base = stream.length;
      findRuns(qn, toks, Math.min(minLen, qn.length)).forEach((r, k) =>
        found.push({ seg: s, occ: k, tokStart: base + r.tokStart, tokEnd: base + r.tokEnd, text: toks.slice(r.tokStart, r.tokEnd).map((t) => t.norm).join(' ') }));
      toks.forEach((t) => stream.push(t.norm));
    }
    for (const f of found) {
      list.push({ seg: f.seg, occ: f.occ });
      ctx.push({ before: stream.slice(Math.max(0, f.tokStart - CTX), f.tokStart), after: stream.slice(f.tokEnd, f.tokEnd + CTX), text: f.text });
    }
    return { list, ctx };
  }, [state, qn, tmode, minLen]);

  const makeTarget = (index: number): ViewTarget => {
    const o = occs.list[index];
    return { ...parseLocation(o.seg.label), occ: o.occ, ctx: { index, list: occs.ctx }, nonce: Date.now() };
  };

  // Vị trí cần mở ban đầu (từ kết quả tìm kiếm).
  const initialTarget = useMemo<ViewTarget | null>(() => {
    if (!state || !targetSeg) return null;
    const seg = state.segments.find((s) => s.id === targetSeg);
    if (!seg) return null;
    const idx = occs.list.findIndex((o) => o.seg.id === targetSeg && o.occ === (urlOcc ?? 0));
    const loc = parseLocation(seg.label);
    return idx >= 0 ? { ...loc, occ: urlOcc ?? 0, ctx: { index: idx, list: occs.ctx }, nonce: 1 } : { ...loc, occ: urlOcc, nonce: 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, targetSeg, urlOcc, occs]);
  const target = jumpTarget ?? initialTarget;

  // Chế độ văn bản: cuộn tới đúng lần xuất hiện được chọn.
  useEffect(() => {
    if (!state || !targetSeg || mode !== 'text') return;
    const sec = document.getElementById(`seg-${targetSeg}`);
    if (!sec) return;
    document.querySelectorAll('.hrm-target').forEach((e) => e.classList.remove('hrm-target'));
    const mark = urlOcc !== undefined ? sec.querySelector<HTMLElement>(`mark[data-occ="${urlOcc}"]`) : null;
    if (mark) mark.classList.add('hrm-target');
    (mark ?? sec).scrollIntoView({ block: 'center' });
  }, [state, targetSeg, urlOcc, mode, minLen]);

  const domNav = mode === 'text' || ext === 'docx';

  const jump = (dir: 1 | -1) => {
    const pick = (total: number) => (nav.index < 0 ? (dir === 1 ? 0 : total - 1) : (nav.index + dir + total) % total);
    if (domNav) {
      const list = Array.from(body.current?.querySelectorAll('[data-hit]') ?? []) as HTMLElement[];
      if (!list.length) { setNav({ index: -1, total: 0 }); return; }
      const next = pick(list.length);
      setNav({ index: next, total: list.length });
      document.querySelectorAll('.hrm-target').forEach((e) => e.classList.remove('hrm-target'));
      const g = list[next].getAttribute('data-occ');
      const same = g !== null && ext === 'docx' ? body.current?.querySelectorAll(`mark[data-occ="${g}"]`) : null;
      (same && same.length ? Array.from(same) : [list[next]]).forEach((e) => e.classList.add('hrm-target'));
      list[next].scrollIntoView({ block: 'center' });
    } else {
      if (!occs.list.length) return;
      const next = pick(occs.list.length);
      setNav({ index: next, total: occs.list.length });
      setJumpTarget(makeTarget(next));
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
  const viewerProps = blob ? { blob, query: q, minLen, target, onError: onViewerError } : null;

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
        <input value={q} onChange={(e) => { setQ(e.target.value); setJumpTarget(null); }} placeholder="Tìm cụm từ trong tài liệu này…"
          className="min-w-[160px] flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none" />
        <button className={btnSecondary} onClick={() => jump(-1)} disabled={!qn.length}>Trước</button>
        <button className={btnSecondary} onClick={() => jump(1)} disabled={!qn.length}>Sau</button>
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
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-900"><Highlight text={s.text} query={q} minLen={minLen} mode={tmode} /></p>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
