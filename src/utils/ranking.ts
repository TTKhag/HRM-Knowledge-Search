import { normalize, type Range } from './text';

/**
 * Khớp theo CHUỖI TỪ LIỀN NHAU, đúng thứ tự trái → phải.
 * - Từ = âm tiết nguyên vẹn (không khớp chuỗi con trong từ khác); bỏ dấu + chữ thường để tìm không dấu.
 * - "Rào cản" (xuống dòng, ô bảng "|", hết câu ". ") chặn chuỗi: hai từ nằm ở hai mục/hai ô/hai câu khác nhau không được coi là liền nhau.
 * - Từ rời rạc, đảo vị trí hoặc cách xa nhau KHÔNG bao giờ được tính là khớp.
 */

export type TokMode = 'query' | 'text' | 'wrap';

export interface Tok { raw: string; norm: string; start: number; end: number; brk: boolean }

const TOKEN_RE = /[\p{L}\p{M}\p{N}]+/gu;
// text: xuống dòng, "|", hoặc dấu kết câu + khoảng trắng là rào cản.
const BREAK_TEXT = /[\n\r|]|[.;:!?…]\s/;
// wrap (PDF): xuống dòng chỉ là ngắt dòng do bố cục, không phải rào cản.
const BREAK_WRAP = /\||[.;:!?…]\s/;

export function tokenize(text: string, mode: TokMode = 'text'): Tok[] {
  const out: Tok[] = [];
  let prevEnd = -1;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index as number;
    const word = m[0];
    const norm = normalize(word);
    if (!norm) continue;
    let brk = false;
    if (mode !== 'query' && prevEnd >= 0) brk = (mode === 'text' ? BREAK_TEXT : BREAK_WRAP).test(text.slice(prevEnd, start));
    out.push({ raw: word.normalize('NFC').toLowerCase(), norm, start, end: start + word.length, brk });
    prevEnd = start + word.length;
  }
  return out;
}

export const MIN_RELEVANCE = 30;

export interface Occurrence {
  tokStart: number; tokEnd: number; qStart: number; len: number;
  /** Vị trí ký tự trong văn bản gốc. */
  start: number; end: number;
}

/**
 * Tìm các chuỗi liền nhau dài nhất giữa truy vấn q và văn bản d (mỗi chuỗi dài >= minLen).
 * Kết quả không chồng lấn, theo thứ tự xuất hiện.
 */
export function findRuns(q: string[], d: Tok[], minLen: number): Occurrence[] {
  const n = q.length;
  const m = d.length;
  if (!n || !m) return [];
  let prev = new Array<number>(n).fill(0);
  const found: Occurrence[] = [];
  for (let i = 0; i < m; i++) {
    const cur = new Array<number>(n).fill(0);
    for (let j = 0; j < n; j++) {
      if (d[i].norm !== q[j]) continue;
      cur[j] = j > 0 && i > 0 && !d[i].brk && prev[j - 1] > 0 ? prev[j - 1] + 1 : 1;
      const extends_ = j + 1 < n && i + 1 < m && !d[i + 1].brk && d[i + 1].norm === q[j + 1];
      if (!extends_ && cur[j] >= minLen) {
        const len = cur[j];
        const ts = i - len + 1;
        found.push({ tokStart: ts, tokEnd: i + 1, qStart: j - len + 1, len, start: d[ts].start, end: d[i].end });
      }
    }
    prev = cur;
  }
  found.sort((a, b) => b.len - a.len || a.tokStart - b.tokStart);
  const taken: Occurrence[] = [];
  for (const f of found) {
    if (!taken.some((t) => f.tokStart < t.tokEnd && t.tokStart < f.tokEnd)) taken.push(f);
  }
  return taken.sort((a, b) => a.tokStart - b.tokStart);
}

/** Truy vấn một từ cần khớp 1 từ; nhiều từ cần ít nhất 2 từ liền nhau. */
export const minRunFor = (queryLen: number) => (queryLen <= 1 ? 1 : 2);

export interface SegmentMatch {
  percent: number;
  /** 1 = chứa nguyên cụm từ liền nhau; 2 = chỉ khớp một phần chuỗi liền nhau, đúng thứ tự. */
  tier: 1 | 2;
  accent: number;
  len: number;
  /** Các lần xuất hiện tốt nhất trong đoạn (cùng độ dài tối đa). */
  occurrences: Occurrence[];
}

/**
 * Chấm một đoạn văn bản: độ liên quan = độ dài chuỗi liền nhau dài nhất / số từ truy vấn.
 * Dưới 30% (hoặc chỉ có từ lẻ khi truy vấn nhiều từ) -> null.
 */
export function scoreSegment(q: Tok[], d: Tok[]): SegmentMatch | null {
  const n = q.length;
  if (!n) return null;
  const runs = findRuns(q.map((t) => t.norm), d, minRunFor(n));
  if (!runs.length) return null;
  const len = Math.max(...runs.map((r) => r.len));
  const percent = len === n ? 100 : Math.min(99, Math.round((100 * len) / n));
  if (percent < MIN_RELEVANCE) return null;
  const kept = runs.filter((r) => r.len === len);
  const accent = Math.max(...kept.map((o) => {
    let eq = 0;
    for (let k = 0; k < len; k++) if (d[o.tokStart + k].raw === q[o.qStart + k].raw) eq++;
    return eq / len;
  }));
  return { percent, tier: len === n ? 1 : 2, accent, len, occurrences: kept };
}

/** Các khoảng ký tự của mọi chuỗi liền nhau (>= minLen từ) trong văn bản — dùng để tô sáng. */
export function phraseRanges(text: string, query: string, minLen: number, mode: TokMode = 'text'): Range[] {
  const q = tokenize(query, 'query');
  if (!q.length) return [];
  return findRuns(q.map((t) => t.norm), tokenize(text, mode), Math.max(1, Math.min(minLen, q.length)))
    .map((o) => ({ start: o.start, end: o.end }));
}

/** Cửa sổ đoạn trích ôm sát một lần xuất hiện, cắt ở ranh giới từ. */
export function snippetWindow(text: string, r: Range, size = 280): Range {
  if (text.length <= size) return { start: 0, end: text.length };
  let end = Math.min(text.length, Math.max(r.end, r.start + Math.floor((size + (r.end - r.start)) / 2)));
  let start = Math.max(0, end - size);
  end = Math.min(text.length, start + size);
  while (start > 0 && start < r.start && !/\s/.test(text[start - 1])) start++;
  while (end < text.length && end > r.end && !/\s/.test(text[end])) end--;
  return { start, end };
}

export function relevanceLabel(percent: number): string {
  if (percent >= 100) return 'Khớp chính xác cụm từ';
  if (percent >= 80) return 'Liên quan cao';
  if (percent >= 50) return 'Liên quan trung bình';
  return 'Liên quan thấp';
}
