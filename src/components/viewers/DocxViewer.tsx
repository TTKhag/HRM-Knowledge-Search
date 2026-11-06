import { useEffect, useRef, useState } from 'react';
import { errMsg, findRanges, normalize } from '../../utils/text';
import type { ViewerProps } from './types';

function clearMarks(root: HTMLElement) {
  root.querySelectorAll('mark.hrm-mark').forEach((m) => {
    const p = m.parentNode as Node;
    p.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    p.normalize();
  });
}

/** Tô sáng từ khóa trực tiếp trên DOM đã dựng (không đổi bố cục tài liệu). */
function applyMarks(root: HTMLElement, terms: string[]) {
  clearMarks(root);
  if (!terms.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const n of nodes) {
    const text = n.data;
    if (!text.trim()) continue;
    const ranges = findRanges(text, terms);
    if (!ranges.length) continue;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const r of ranges) {
      if (r.start > pos) frag.append(text.slice(pos, r.start));
      const m = document.createElement('mark');
      m.className = 'hrm-mark';
      m.setAttribute('data-hit', '1');
      m.textContent = text.slice(r.start, r.end);
      frag.append(m);
      pos = r.end;
    }
    if (pos < text.length) frag.append(text.slice(pos));
    (n.parentNode as Node).replaceChild(frag, n);
  }
}

const squash = (s: string) => normalize(s).replace(/\s+/g, ' ').trim();

/** Tìm khối (đoạn/ô bảng) chứa nội dung của đoạn tìm kiếm và cuộn tới đó. */
function locate(root: HTMLElement, text: string | undefined) {
  root.querySelectorAll('.hrm-target').forEach((e) => e.classList.remove('hrm-target'));
  let el: Element | null = null;
  if (text) {
    const key = squash(text.split('\n')[0].split(' | ')[0]).slice(0, 50);
    if (key.length >= 3) {
      const cands = Array.from(root.querySelectorAll('p,td,th,li')).filter((e) => squash(e.textContent ?? '').includes(key));
      el = cands.find((e) => e.querySelector('mark.hrm-mark')) ?? cands[0] ?? null;
    }
  }
  if (!el) el = root.querySelector('mark.hrm-mark');
  if (el) {
    el.classList.add('hrm-target');
    el.scrollIntoView({ block: 'center' });
  }
}

export default function DocxViewer({ blob, terms, target, onError }: ViewerProps) {
  const styleBox = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
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
    if (ready && body.current) applyMarks(body.current, terms);
  }, [ready, terms]);

  useEffect(() => {
    if (ready && body.current && target) locate(body.current, target.text);
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
