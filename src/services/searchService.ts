import MiniSearch from 'minisearch';
import { db } from '../database/db';
import { normalize } from '../utils/text';
import { scoreSegment, tokenize } from '../utils/ranking';
import { MAX_RESULTS } from '../utils/constants';
import type { FileExt, SearchHit } from '../types';

interface IndexDoc { id: number; docId: number; module: string; ext: FileExt; text: string }

let engine: MiniSearch<IndexDoc> | null = null;
let building: Promise<MiniSearch<IndexDoc>> | null = null;

/** Số đoạn ứng viên tối đa đưa vào bước chấm điểm. */
const MAX_CANDIDATES = 6000;

function createEngine() {
  return new MiniSearch<IndexDoc>({
    fields: ['text'],
    storeFields: ['docId', 'module', 'ext'],
    // Cả lúc lập chỉ mục và lúc tìm kiếm đều chuẩn hóa NFC, bỏ dấu, chữ thường; chỉ khớp từ nguyên vẹn.
    processTerm: (term) => normalize(term) || null,
    tokenize: (s) => s.normalize('NFC').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean),
  });
}

async function build(): Promise<MiniSearch<IndexDoc>> {
  const ms = createEngine();
  const docs = await db.documents.toArray();
  const meta = new Map(docs.map((d) => [d.id as number, d]));
  const batch: IndexDoc[] = [];
  await db.segments.each((s) => {
    const d = meta.get(s.docId);
    if (!d || s.id === undefined) return;
    batch.push({ id: s.id, docId: s.docId, module: d.module, ext: d.ext, text: s.text });
  });
  ms.addAll(batch);
  return ms;
}

/** Đánh dấu chỉ mục cần dựng lại (gọi sau khi import/xóa/khôi phục). */
export function invalidateIndex() {
  engine = null;
  building = null;
}

async function ensure(): Promise<MiniSearch<IndexDoc>> {
  if (engine) return engine;
  if (!building) {
    building = build().then((e) => (engine = e));
  }
  return building;
}

export interface SearchFilter { module?: string; ext?: string }

/**
 * Tìm kiếm theo chuỗi từ liền nhau, trả về TỪNG LẦN XUẤT HIỆN (không gộp theo đoạn/tài liệu):
 * 1) Lấy ứng viên: mọi đoạn chứa ít nhất một cặp từ liền kề của truy vấn (điều kiện cần của chuỗi >= 2 từ).
 * 2) Chấm điểm lại từng đoạn theo chuỗi liền nhau dài nhất (utils/ranking.ts); loại dưới 30%.
 * 3) Xếp: nguyên cụm → khớp một phần đúng thứ tự; trong mỗi nhóm theo % giảm dần.
 */
export async function search(query: string, filter: SearchFilter = {}): Promise<SearchHit[]> {
  const q = tokenize(query, 'query');
  if (!q.length) return [];
  const ms = await ensure();
  const filterFn = (r: unknown) => {
    const { module, ext } = r as { module?: string; ext?: string };
    return (!filter.module || module === filter.module) && (!filter.ext || ext === filter.ext);
  };

  const qn = q.map((t) => t.norm);
  let msQuery: Parameters<typeof ms.search>[0];
  if (qn.length === 1) {
    msQuery = qn[0];
  } else {
    const pairs = Array.from(new Set(qn.slice(0, -1).map((t, i) => `${t} ${qn[i + 1]}`)));
    msQuery = { combineWith: 'OR', queries: pairs.map((p) => ({ combineWith: 'AND', queries: p.split(' ') })) };
  }
  const found = ms.search(msQuery, { filter: filterFn }).slice(0, MAX_CANDIDATES);
  if (!found.length) return [];

  const segs = await db.segments.bulkGet(found.map((f) => f.id as number));
  const scored: { hit: SearchHit; tier: number; accent: number }[] = [];
  found.forEach((f, i) => {
    const seg = segs[i];
    if (!seg) return;
    const ext = f.ext as FileExt;
    const m = scoreSegment(q, tokenize(seg.text, ext === 'pdf' ? 'wrap' : 'text'));
    if (!m) return;
    const ranges = m.occurrences.map((o) => ({ start: o.start, end: o.end }));
    m.occurrences.forEach((o, k) => {
      scored.push({
        tier: m.tier,
        accent: m.accent,
        hit: {
          segmentId: f.id as number, docId: f.docId as number, score: f.score, relevance: m.percent,
          occurrence: k, len: m.len, start: o.start, end: o.end, ranges, module: f.module as string, ext,
        },
      });
    });
  });

  scored.sort((a, b) =>
    a.tier - b.tier || b.hit.relevance - a.hit.relevance || b.accent - a.accent || b.hit.score - a.hit.score ||
    a.hit.segmentId - b.hit.segmentId || a.hit.occurrence - b.hit.occurrence);
  return scored.slice(0, MAX_RESULTS).map((s) => s.hit);
}
