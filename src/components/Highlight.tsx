import { Fragment, useMemo } from 'react';
import { phraseRanges, type TokMode } from '../utils/ranking';
import type { Range } from '../utils/text';

interface Props {
  text: string;
  /** Truy vấn: chỉ tô sáng các chuỗi từ LIỀN NHAU (>= minLen từ), không tô từ lẻ. */
  query?: string;
  minLen?: number;
  mode?: TokMode;
  /** Hoặc truyền sẵn các khoảng cần tô sáng. */
  ranges?: Range[];
}

/** Tô sáng cụm từ (không phân biệt dấu/hoa thường). Mỗi lần xuất hiện có data-occ = thứ tự trong đoạn. */
export default function Highlight({ text, query = '', minLen = 1, mode = 'text', ranges }: Props) {
  const rs = useMemo(() => ranges ?? (query ? phraseRanges(text, query, minLen, mode) : []), [text, query, minLen, mode, ranges]);
  const parts = useMemo(() => {
    const out: { s: string; hit: number }[] = [];
    let pos = 0;
    rs.forEach((r, k) => {
      if (r.start > pos) out.push({ s: text.slice(pos, r.start), hit: -1 });
      out.push({ s: text.slice(r.start, r.end), hit: k });
      pos = r.end;
    });
    if (pos < text.length) out.push({ s: text.slice(pos), hit: -1 });
    return out;
  }, [text, rs]);

  return (
    <>
      {parts.map((p, i) =>
        p.hit >= 0
          ? <mark key={i} data-hit="1" data-occ={p.hit} className="bg-yellow-200 px-0.5 text-black">{p.s}</mark>
          : <Fragment key={i}>{p.s}</Fragment>,
      )}
    </>
  );
}
