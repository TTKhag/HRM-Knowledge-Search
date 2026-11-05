import { MAX_SEGMENT_CHARS } from './constants';

const MARKS = /[\u0300-\u036f]/g;

/** Bỏ dấu tiếng Việt, đ -> d, chữ thường. */
export function normalize(input: string): string {
  return input.normalize('NFD').replace(MARKS, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

export function cleanText(input: string): string {
  return input.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function queryTerms(query: string): string[] {
  return Array.from(new Set(normalize(query).split(/[^a-z0-9]+/).filter(Boolean)));
}

/** Chuẩn hóa từng ký tự và giữ ánh xạ về vị trí gốc để highlight đúng trên văn bản có dấu. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalize(text[i]);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      map.push(i);
    }
  }
  return { norm, map };
}

export interface Range { start: number; end: number }

export function findRanges(text: string, terms: string[]): Range[] {
  if (!terms.length || !text) return [];
  const { norm, map } = normalizeWithMap(text);
  const raw: Range[] = [];
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const at = norm.indexOf(t, from);
      if (at === -1) break;
      raw.push({ start: map[at], end: map[at + t.length - 1] + 1 });
      from = at + t.length;
    }
  }
  raw.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** Cắt đoạn trích quanh vị trí khớp đầu tiên. */
export function makeSnippet(text: string, terms: string[], size = 260): string {
  const flat = text.replace(/\s+/g, ' ');
  if (flat.length <= size) return flat;
  const first = findRanges(flat, terms)[0];
  if (!first) return flat.slice(0, size) + '…';
  const start = Math.max(0, first.start - Math.floor(size / 3));
  const end = Math.min(flat.length, start + size);
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

/** Gom các dòng thành các đoạn không vượt quá MAX_SEGMENT_CHARS. */
export function chunkLines(lines: string[], max = MAX_SEGMENT_CHARS): string[] {
  const out: string[] = [];
  let buf = '';
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (buf && buf.length + l.length + 1 > max) {
      out.push(buf);
      buf = '';
    }
    if (l.length > max) {
      for (let i = 0; i < l.length; i += max) out.push(l.slice(i, i + max));
      continue;
    }
    buf = buf ? buf + '\n' + l : l;
  }
  if (buf) out.push(buf);
  return out;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
