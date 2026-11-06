import MiniSearch from 'minisearch';
import { db } from '../database/db';
import { normalize } from '../utils/text';
import { scoreText, tokenize } from '../utils/ranking';
import { MAX_RESULTS } from '../utils/constants';
import type { FileExt, SearchHit } from '../types';

interface IndexDoc { id: number; docId: number; module: string; ext: FileExt; text: string }

let engine: MiniSearch<IndexDoc> | null = null;
let building: Promise<MiniSearch<IndexDoc>> | null = null;

/** Số ứng viên tối đa đưa vào bước chấm điểm. */
const MAX_AND = 3000;
const MAX_OR = 1500;

function createEngine() {
  return new MiniSearch<IndexDoc>({
    fields: ['text'],
    storeFields: ['docId', 'module', 'ext'],
    // Cả lúc lập chỉ mục và lúc tìm kiếm đều chuẩn hóa NFC, bỏ dấu, chữ thường.
    processTerm: (term) => normalize(term) || null,
    tokenize: (s) => s.normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean),
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

interface Candidate { id: number; docId: number; module: string; ext: FileExt; bm25: number }

/**
 * Tìm kiếm theo độ liên quan:
 * 1) MiniSearch lấy ứng viên: toàn bộ đoạn chứa đủ mọi từ (AND) + các đoạn khớp một phần (OR), chỉ khớp từ nguyên vẹn.
 * 2) Mỗi ứng viên được chấm lại theo cụm từ liên tiếp / thứ tự / tỷ lệ từ khớp (utils/ranking.ts).
 * 3) Loại kết quả dưới 30%, xếp theo nhóm (cụm chính xác → chuỗi liên tiếp → đúng thứ tự → rời rạc) rồi theo % liên quan.
 */
export async function search(query: string, filter: SearchFilter = {}): Promise<SearchHit[]> {
  const q = tokenize(query);
  if (!q.norm.length) return [];
  const ms = await ensure();
  const filterFn = (r: unknown) => {
    const { module, ext } = r as { module?: string; ext?: string };
    return (!filter.module || module === filter.module) && (!filter.ext || ext === filter.ext);
  };

  const cands = new Map<number, Candidate>();
  const add = (list: ReturnType<typeof ms.search>) => {
    for (const r of list) {
      if (cands.has(r.id as number)) continue;
      cands.set(r.id as number, { id: r.id as number, docId: r.docId as number, module: r.module as string, ext: r.ext as FileExt, bm25: r.score });
    }
  };
  add(ms.search(query, { combineWith: 'AND', filter: filterFn }).slice(0, MAX_AND));
  add(ms.search(query, { combineWith: 'OR', filter: filterFn }).slice(0, MAX_OR));
  if (!cands.size) return [];

  const list = Array.from(cands.values());
  const segs = await db.segments.bulkGet(list.map((c) => c.id));

  const scored: { hit: SearchHit; tier: number; accent: number }[] = [];
  list.forEach((c, i) => {
    const seg = segs[i];
    if (!seg) return;
    const rel = scoreText(q, tokenize(seg.text));
    if (!rel) return;
    scored.push({
      tier: rel.tier,
      accent: rel.accent,
      hit: { segmentId: c.id, docId: c.docId, score: c.bm25, relevance: rel.percent, module: c.module, ext: c.ext },
    });
  });

  scored.sort((a, b) =>
    a.tier - b.tier || b.hit.relevance - a.hit.relevance || b.accent - a.accent || b.hit.score - a.hit.score);
  return scored.slice(0, MAX_RESULTS).map((s) => s.hit);
}
