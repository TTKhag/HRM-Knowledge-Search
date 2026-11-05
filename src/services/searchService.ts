import MiniSearch from 'minisearch';
import { db } from '../database/db';
import { normalize, queryTerms } from '../utils/text';
import { MAX_RESULTS } from '../utils/constants';
import type { FileExt, SearchHit } from '../types';

interface IndexDoc { id: number; docId: number; module: string; ext: FileExt; text: string }

let engine: MiniSearch<IndexDoc> | null = null;
let building: Promise<MiniSearch<IndexDoc>> | null = null;

function createEngine() {
  return new MiniSearch<IndexDoc>({
    fields: ['text'],
    storeFields: ['docId', 'module', 'ext'],
    // Cả lúc lập chỉ mục và lúc tìm kiếm đều bỏ dấu + chữ thường.
    processTerm: (term) => normalize(term) || null,
    tokenize: (s) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
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

export async function search(query: string, filter: SearchFilter = {}): Promise<SearchHit[]> {
  if (!queryTerms(query).length) return [];
  const ms = await ensure();
  const filterFn = (r: unknown) => {
    const { module, ext } = r as { module?: string; ext?: string };
    return (!filter.module || module === filter.module) && (!filter.ext || ext === filter.ext);
  };

  let results = ms.search(query, { prefix: true, combineWith: 'AND', filter: filterFn });
  if (!results.length) {
    // Không có đoạn nào chứa đủ mọi từ khóa -> nới lỏng sang khớp một phần (có sai khác nhỏ).
    results = ms.search(query, { prefix: true, fuzzy: 0.15, combineWith: 'OR', filter: filterFn });
  }
  return results.slice(0, MAX_RESULTS).map((r) => ({
    segmentId: r.id as number,
    docId: r.docId as number,
    score: r.score,
    module: r.module as string,
    ext: r.ext as FileExt,
  }));
}
