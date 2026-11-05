import { Fragment, useMemo } from 'react';
import { findRanges } from '../utils/text';

/** Tô sáng từ khóa (không phân biệt dấu/hoa thường). Không dùng dangerouslySetInnerHTML. */
export default function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    const ranges = findRanges(text, terms);
    const out: { s: string; hit: boolean }[] = [];
    let pos = 0;
    for (const r of ranges) {
      if (r.start > pos) out.push({ s: text.slice(pos, r.start), hit: false });
      out.push({ s: text.slice(r.start, r.end), hit: true });
      pos = r.end;
    }
    if (pos < text.length) out.push({ s: text.slice(pos), hit: false });
    return out;
  }, [text, terms]);

  return (
    <>
      {parts.map((p, i) =>
        p.hit ? <mark key={i} data-hit="1" className="bg-yellow-200 text-black px-0.5">{p.s}</mark> : <Fragment key={i}>{p.s}</Fragment>,
      )}
    </>
  );
}
