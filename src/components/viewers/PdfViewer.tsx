import { useEffect, useRef, useState } from 'react';
import 'pdfjs-dist/web/pdf_viewer.css';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import { loadPdfjs } from '../../services/pdfjs';
import { errMsg } from '../../utils/text';
import { findRuns, tokenize } from '../../utils/ranking';
import type { ViewerProps } from './types';

/**
 * Tô sáng các chuỗi từ liền nhau trên lớp chữ của trang. Ghép chữ của các span theo thứ tự đọc (br = xuống dòng)
 * nên cụm từ nằm trên nhiều span/nhiều dòng vẫn được nhận ra. Mỗi lần xuất hiện có data-occ = thứ tự trong trang.
 */
function markHits(container: HTMLElement, query: string, minLen: number) {
  const q = tokenize(query, 'query').map((t) => t.norm);
  const items: { el: HTMLElement; start: number; end: number }[] = [];
  let combined = '';
  container.querySelectorAll('span, br').forEach((el) => {
    if (el.tagName === 'BR') { combined += '\n'; return; }
    if (el.childElementCount) return;
    const t = el.textContent ?? '';
    if (!t) return;
    const start = combined.length;
    combined += t;
    items.push({ el: el as HTMLElement, start, end: combined.length });
    combined += ' ';
  });
  items.forEach(({ el }) => { el.classList.remove('hrm-hit', 'hrm-target'); el.removeAttribute('data-hit'); el.removeAttribute('data-occ'); });
  if (!q.length) return;
  const runs = findRuns(q, tokenize(combined, 'wrap'), Math.max(1, Math.min(minLen, q.length)));
  runs.forEach((r, k) => {
    let first = true;
    for (const it of items) {
      if (it.end <= r.start || it.start >= r.end) continue;
      it.el.classList.add('hrm-hit');
      it.el.setAttribute('data-occ', String(k));
      if (first) { it.el.setAttribute('data-hit', '1'); first = false; }
    }
  });
}

interface PageProps {
  pdf: PDFDocumentProxy; num: number; scale: number; baseW: number; baseH: number; query: string; minLen: number;
  register: (num: number, el: HTMLElement | null) => void; onRendered: (num: number) => void;
}

/** Một trang PDF: chỉ vẽ khi gần vùng nhìn thấy, giải phóng canvas khi ở xa để tiết kiệm bộ nhớ. */
function PageView({ pdf, num, scale, baseW, baseH, query, minLen, register, onRendered }: PageProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const hitRef = useRef({ query, minLen });
  hitRef.current = { query, minLen };
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current as HTMLDivElement;
    register(num, el);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => { io.disconnect(); register(num, null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num]);

  useEffect(() => {
    if (!visible) {
      const c = canvasRef.current;
      if (c) { c.width = 0; c.height = 0; }
      textRef.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    let layer: TextLayer | null = null;
    (async () => {
      try {
        if (taskRef.current) {
          taskRef.current.cancel();
          try { await taskRef.current.promise; } catch { /* đã hủy */ }
        }
        const page = await pdf.getPage(num);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        setSize({ w: viewport.width, h: viewport.height });
        const canvas = canvasRef.current as HTMLCanvasElement;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        taskRef.current = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await taskRef.current.promise;
        if (cancelled) return;
        const container = textRef.current as HTMLDivElement;
        container.replaceChildren();
        container.style.setProperty('--scale-factor', String(viewport.scale));
        const { TextLayer: TL } = await loadPdfjs();
        layer = new TL({ textContentSource: page.streamTextContent(), container, viewport });
        await layer.render();
        if (cancelled) return;
        markHits(container, hitRef.current.query, hitRef.current.minLen);
        onRendered(num);
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === 'RenderingCancelledException')) console.warn(`PDF trang ${num}:`, e);
      }
    })();
    return () => { cancelled = true; taskRef.current?.cancel(); layer?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scale, pdf, num]);

  useEffect(() => { if (textRef.current) markHits(textRef.current, query, minLen); }, [query, minLen]);

  return (
    <div ref={box} data-page={num} style={{ width: size?.w ?? baseW * scale, height: size?.h ?? baseH * scale, scrollMarginTop: 72 }}
      className="relative mx-auto mb-3 bg-white shadow">
      <canvas ref={canvasRef} className="block" />
      <div ref={textRef} className="textLayer" />
      <span className="absolute bottom-1 right-2 text-[10px] text-gray-400">Trang {num}</span>
    </div>
  );
}

export default function PdfViewer({ blob, query, minLen, target, onError }: ViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const pages = useRef(new Map<number, HTMLElement>());
  const pending = useRef<{ page: number; occ?: number } | null>(null);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (cancelled) { void doc.destroy(); return; }
        const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
        setBase({ w: vp.width, h: vp.height });
        setPdf(doc);
      } catch (e) {
        if (!cancelled) errRef.current(errMsg(e));
      }
    })();
    return () => { cancelled = true; void doc?.destroy(); };
  }, [blob]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = base && width ? Math.min(2, Math.max(0.4, (width - 16) / base.w)) : 1;

  const scrollToPage = (n: number) => pages.current.get(n)?.scrollIntoView({ block: 'start' });

  /** Cuộn tới đúng lần xuất hiện thứ occ trong trang (nếu lớp chữ đã dựng xong). */
  const focusOcc = (page: number, occ?: number): boolean => {
    const el = pages.current.get(page);
    if (!el || occ === undefined) return false;
    const spans = el.querySelectorAll<HTMLElement>(`[data-occ="${occ}"]`);
    if (!spans.length) return false;
    pages.current.forEach((p) => p.querySelectorAll('.hrm-target').forEach((x) => x.classList.remove('hrm-target')));
    spans.forEach((s) => s.classList.add('hrm-target'));
    spans[0].scrollIntoView({ block: 'center' });
    return true;
  };

  useEffect(() => {
    if (!pdf || !target?.page) return;
    pending.current = { page: target.page, occ: target.occ };
    const id = requestAnimationFrame(() => {
      scrollToPage(target.page as number);
      focusOcc(target.page as number, target.occ);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, target?.nonce, base]);

  const onRendered = (n: number) => {
    const p = pending.current;
    if (p && p.page === n) {
      scrollToPage(n);
      if (!focusOcc(n, p.occ)) return;
      pending.current = null;
    }
  };

  return (
    <div ref={wrap} className="rounded bg-gray-200 p-2">
      {!pdf && <p className="p-4 text-sm text-gray-600">Đang tải PDF…</p>}
      {pdf && base && Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
        <PageView key={n} pdf={pdf} num={n} scale={scale} baseW={base.w} baseH={base.h} query={query} minLen={minLen}
          register={(num, el) => { if (el) pages.current.set(num, el); else pages.current.delete(num); }} onRendered={onRendered} />
      ))}
    </div>
  );
}
