import { normalize } from './text';

export interface Tokens { raw: string[]; norm: string[] }

/** Tách thành "từ" (âm tiết) nguyên vẹn: NFC, chữ thường, bỏ dấu câu/khoảng trắng thừa. norm = bỏ dấu để khớp không dấu. */
export function tokenize(text: string): Tokens {
  const raw = text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return { raw, norm: raw.map(normalize) };
}

export const MIN_RELEVANCE = 30;

export interface Relevance {
  /** 0–100; 100 = chứa nguyên cụm từ tìm kiếm. */
  percent: number;
  /** 1 = khớp nguyên cụm; 2 = khớp chuỗi liên tiếp một phần; 3 = nhiều từ đúng thứ tự nhưng rời rạc; 4 = khớp một phần còn lại. */
  tier: 1 | 2 | 3 | 4;
  /** 0–1: tỷ lệ từ khớp cả dấu (dùng để phân hạng khi bằng điểm). */
  accent: number;
}

/** Độ dài chuỗi liên tiếp dài nhất và dãy con đúng thứ tự dài nhất giữa truy vấn q và văn bản d. */
function alignment(q: string[], d: string[]): { run: number; lcs: number } {
  const n = q.length;
  let run = 0;
  let prevRun = new Array<number>(n + 1).fill(0);
  let prevLcs = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < d.length; i++) {
    const curRun = new Array<number>(n + 1).fill(0);
    const curLcs = new Array<number>(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (d[i] === q[j - 1]) {
        curRun[j] = prevRun[j - 1] + 1;
        if (curRun[j] > run) run = curRun[j];
        curLcs[j] = prevLcs[j - 1] + 1;
      } else {
        curLcs[j] = Math.max(prevLcs[j], curLcs[j - 1]);
      }
    }
    prevRun = curRun;
    prevLcs = curLcs;
  }
  return { run, lcs: prevLcs[n] };
}

/** Đoạn ngắn nhất của d chứa đủ mọi từ (khác nhau) đã khớp. */
function minSpan(d: string[], wanted: Set<string>): number {
  const need = wanted.size;
  const have = new Map<string, number>();
  let got = 0;
  let best = Infinity;
  let l = 0;
  for (let r = 0; r < d.length; r++) {
    if (wanted.has(d[r])) {
      const c = (have.get(d[r]) ?? 0) + 1;
      have.set(d[r], c);
      if (c === 1) got++;
    }
    while (got === need) {
      best = Math.min(best, r - l + 1);
      if (wanted.has(d[l])) {
        const c = (have.get(d[l]) as number) - 1;
        have.set(d[l], c);
        if (c === 0) got--;
      }
      l++;
    }
  }
  return best;
}

/**
 * Chấm độ liên quan của một đoạn văn bản với truy vấn. Trả về null nếu dưới ngưỡng MIN_RELEVANCE.
 * Khớp theo từ nguyên vẹn (không khớp chuỗi con trong từ khác); ưu tiên cụm từ liền nhau, đúng thứ tự.
 */
export function scoreText(q: Tokens, d: Tokens): Relevance | null {
  const n = q.norm.length;
  if (!n || !d.norm.length) return null;

  const present = new Set(d.norm);
  const uniqueQ = new Set(q.norm);
  const matched = new Set([...uniqueQ].filter((t) => present.has(t)));
  if (!matched.size) return null;

  const { run, lcs } = alignment(q.norm, d.norm);
  const rawSet = new Set(d.raw);
  const accent = new Set(q.raw.filter((t) => rawSet.has(t))).size / new Set(q.raw).size;

  if (run === n) return { percent: 100, tier: 1, accent };

  const coverage = matched.size / uniqueQ.size;
  const base = 0.2 * coverage + 0.3 * (lcs / n) + 0.5 * (run / n);
  // Các từ nằm xa nhau trong đoạn văn thì giảm điểm.
  const compact = Math.min(1, matched.size / minSpan(d.norm, matched));
  const percent = Math.min(99, Math.round(100 * base * (0.75 + 0.25 * compact)));
  if (percent < MIN_RELEVANCE) return null;

  const tier = run >= 2 ? 2 : lcs >= 2 ? 3 : 4;
  return { percent, tier, accent };
}

export function relevanceLabel(percent: number): string {
  if (percent >= 100) return 'Khớp chính xác cụm từ';
  if (percent >= 80) return 'Liên quan cao';
  if (percent >= 50) return 'Liên quan trung bình';
  return 'Liên quan thấp';
}
