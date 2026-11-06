import { useEffect, useRef, useState } from 'react';
import { errMsg } from '../../utils/text';
import { findRuns, tokenize } from '../../utils/ranking';
import type { OccCtx, ViewerProps } from './types';

const BLOCK = 'p,td,th,li,h1,h2,h3,h4,h5,h6';
const CTX = 6;

function clearMarks(root: HTMLElement) {
  root.querySelectorAll('mark.hrm-mark').forEach((m) => {
    const p = m.parentNode as Node;
    p.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    p.normalize();
  });
}

/**
 * Tô sáng các chuỗi từ liền nhau trên DOM đã dựng. Văn bản của toàn tài liệu được ghép theo thứ tự đọc
 * (mỗi đoạn/ô bảng là một khối, giữa các khối có rào cản) nên cụm từ nằm trên nhiều "run" định dạng vẫn khớp.
 * Trả về ngữ cảnh của từng lần xuất hiện theo thứ tự trong tài liệu (mark thứ k có data-occ = k).
 */
function applyMarks(root: HTMLElement, query: string, minLen: number): OccCtx[] {
  clearMarks(root);
  const q = tokenize(query, 'query').map((t) => t.norm);
  if (!q.length) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let combined = '';
  let prevBlock: Element | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data) continue;
    const block = node.parentElement?.closest(BLOCK) ?? root;
    if (prevBlock && block !== prevBlock) combined += '\n';
    prevBlock = block;
    nodes.push({ node, start: combined.length, end: combined.length + node.data.length });
    combined += node.data;
  }

  const toks = tokenize(combined, 'text');
  const runs = findRuns(q, toks, Math.max(1, Math.min(minLen, q.length)));
  if (!runs.length) return [];

  const norm = toks.map((t) => t.norm);
  const ctxs: OccCtx[] = runs.map((r) => ({
    before: norm.slice(Math.max(0, r.tokStart - CTX), r.tokStart),
    after: norm.slice(r.tokEnd, r.tokEnd + CTX),
    text: norm.slice(r.tokStart, r.tokEnd).join(' '),
  }));

  // Gom các lát cắt cần bọc <mark> theo từng text node.
  const slices = new Map<Text, { from: number; to: number; g: number }[]>();
  runs.forEach((r, g) => {
    for (const n of nodes) {
      if (n.end <= r.start || n.start >= r.end) continue;
      const list = slices.get(n.node) ?? [];
      list.push({ from: Math.max(r.start, n.start) - n.start, to: Math.min(r.end, n.end) - n.start, g });
      slices.set(n.node, list);
    }
  });
  const seen = new Set<number>();
  for (const n of nodes) {
    const list = slices.get(n.node);
    if (!list) continue;
    list.sort((a, b) => a.from - b.from);
    const text = n.node.data;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const s of list) {
      if (s.from > pos) frag.append(text.slice(pos, s.from));
      const m = document.createElement('mark');
      m.className = 'hrm-mark';
      m.setAttribute('data-occ', String(s.g));
      if (!seen.has(s.g)) { m.setAttribute('data-hit', '1'); seen.add(s.g); }
      m.textContent = text.slice(s.from, s.to);
      frag.append(m);
      pos = s.to;
    }
    if (pos < text.length) frag.append(text.slice(pos));
    (n.node.parentNode as Node).replaceChild(frag, n.node);
  }
  return ctxs;
}

const tail = (a: string[], k: number) => (k ? a.slice(-k).join(' ') : '');
const head = (a: string[], k: number) => (k ? a.slice(0, k).join(' ') : '');

/**
 * Chọn lần xuất hiện trong DOM tương ứng với lần xuất hiện được chọn từ kết quả tìm kiếm.
 * Khớp theo ngữ cảnh (các từ liền trước/sau); nếu có nhiều lần giống hệt nhau thì dùng thứ tự trong số các lần giống nhau.
 * Nhờ vậy mục lục và nội dung có cùng cụm từ vẫn được phân biệt.
 */
function pickOccurrence(dom: OccCtx[], ctx: { index: number; list: OccCtx[] } | undefined): number {
  if (!dom.length) return -1;
  if (!ctx) return 0;
  const want = ctx.list[ctx.index];
  if (!want) return 0;
  for (const k of [CTX, 4, 2, 1, 0]) {
    const same = (a: OccCtx) => a.text === want.text && tail(a.before, k) === tail(want.before, k) && head(a.after, k) === head(want.after, k);
    const cands = dom.map((c, i) => (same(c) ? i : -1)).filter((i) => i >= 0);
    if (cands.length) {
      const ordinal = ctx.list.slice(0, ctx.index).filter(same).length;
      return cands[Math.min(ordinal, cands.length - 1)];
    }
  }
  return 0;
}

function focusGroup(root: HTMLElement, g: number) {
  root.querySelectorAll('.hrm-target').forEach((e) => e.classList.remove('hrm-target'));
  const marks = root.querySelectorAll<HTMLElement>(`mark[data-occ="${g}"]`);
  if (!marks.length) return;
  marks.forEach((m) => m.classList.add('hrm-target'));
  marks[0].scrollIntoView({ block: 'center' });
}

export default function DocxViewer({ blob, query, minLen, target, onError }: ViewerProps) {
  const styleBox = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const domCtx = useRef<OccCtx[]>([]);
  const [ready, setReady] = useState(false);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled || !body.current || !styleBox.current) return;
        body.current.replaceChildren();
        await renderAsync(blob, body.current, styleBox.current, {
          className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true,
          useBase64URL: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
        });
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) errRef.current(errMsg(e));
      }
    })();
    return () => { cancelled = true; };
  }, [blob]);

  useEffect(() => {
    if (ready && body.current) domCtx.current = applyMarks(body.current, query, minLen);
  }, [ready, query, minLen]);

  useEffect(() => {
    if (!ready || !body.current || !target) return;
    const g = pickOccurrence(domCtx.current, target.ctx);
    if (g >= 0) focusGroup(body.current, g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, target?.nonce]);

  return (
    <div>
      {!ready && <p className="p-4 text-sm text-gray-600">Đang dựng tài liệu…</p>}
      <div ref={styleBox} />
      <div ref={body} className="overflow-x-auto rounded bg-gray-200" />
    </div>
  );
}
