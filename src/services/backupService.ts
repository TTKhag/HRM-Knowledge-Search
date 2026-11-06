import { db } from '../database/db';
import { invalidateIndex } from './searchService';
import { SUPPORTED_EXTS } from '../utils/constants';
import type { BackupFile, DocRecord, FileExt, SegmentRecord } from '../types';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(r.error ?? new Error('Không đọc được file gốc'));
    r.readAsDataURL(blob);
  });
}

async function base64ToBlob(data: string, type: string): Promise<Blob> {
  const res = await fetch(`data:${type || 'application/octet-stream'};base64,${data}`);
  return res.blob();
}

/** Backup phiên bản 2: nội dung tìm kiếm + file gốc (base64). JSON được ghép từng phần để tránh một chuỗi quá lớn trong bộ nhớ. */
export async function exportBackup(onProgress?: (done: number, total: number) => void): Promise<{ blob: Blob; filename: string; docs: number; originals: number }> {
  const [documents, segments] = await Promise.all([db.documents.toArray(), db.segments.toArray()]);
  const parts: BlobPart[] = [
    `{"app":"hrm-knowledge-search","version":2,"exportedAt":${JSON.stringify(new Date().toISOString())},"documents":`,
    JSON.stringify(documents),
    ',"segments":',
    JSON.stringify(segments),
    ',"files":[',
  ];
  const keys = (await db.blobs.toCollection().primaryKeys()) as number[];
  let n = 0;
  for (const key of keys) {
    const rec = await db.blobs.get(key);
    if (!rec) continue;
    const data = await blobToBase64(rec.blob);
    parts.push(new Blob([(n ? ',' : '') + JSON.stringify({ docId: rec.docId, type: rec.type, data })]));
    n++;
    onProgress?.(n, keys.length);
  }
  parts.push(']}');
  const stamp = new Date().toISOString().slice(0, 10);
  return { blob: new Blob(parts, { type: 'application/json' }), filename: `hrm-backup-${stamp}.json`, docs: documents.length, originals: n };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Kiểm tra cấu trúc file backup (v1 hoặc v2). Trả về dữ liệu hợp lệ hoặc ném lỗi tiếng Việt; không đụng đến dữ liệu hiện tại. */
export async function validateBackup(file: File): Promise<BackupFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('File không phải JSON hợp lệ (hoặc quá lớn để đọc trong trình duyệt).');
  }
  if (!isObj(raw) || raw.app !== 'hrm-knowledge-search') throw new Error('Đây không phải file backup của HRM Knowledge Search.');
  if (raw.version !== 1 && raw.version !== 2) throw new Error('Phiên bản backup không được hỗ trợ.');
  if (!Array.isArray(raw.documents) || !Array.isArray(raw.segments)) throw new Error('File backup thiếu danh sách tài liệu hoặc nội dung.');

  const ids = new Set<number>();
  for (const [i, d] of raw.documents.entries()) {
    if (!isObj(d) || typeof d.id !== 'number' || typeof d.name !== 'string' || typeof d.module !== 'string' ||
        typeof d.hash !== 'string' || typeof d.importedAt !== 'number' || typeof d.size !== 'number' ||
        !SUPPORTED_EXTS.includes(d.ext as FileExt)) {
      throw new Error(`Tài liệu thứ ${i + 1} trong backup không hợp lệ.`);
    }
    if (ids.has(d.id)) throw new Error(`Backup có mã tài liệu bị trùng (${d.id}).`);
    ids.add(d.id);
  }
  for (const [i, s] of raw.segments.entries()) {
    if (!isObj(s) || typeof s.docId !== 'number' || typeof s.text !== 'string' || typeof s.label !== 'string' ||
        typeof s.index !== 'number' || !ids.has(s.docId)) {
      throw new Error(`Đoạn nội dung thứ ${i + 1} trong backup không hợp lệ hoặc không thuộc tài liệu nào.`);
    }
  }
  if (raw.files !== undefined) {
    if (!Array.isArray(raw.files)) throw new Error('Danh sách file gốc trong backup không hợp lệ.');
    for (const [i, f] of raw.files.entries()) {
      if (!isObj(f) || typeof f.docId !== 'number' || typeof f.type !== 'string' || typeof f.data !== 'string' || !ids.has(f.docId)) {
        throw new Error(`File gốc thứ ${i + 1} trong backup không hợp lệ.`);
      }
    }
  }
  return raw as unknown as BackupFile;
}

export interface RestoreResult { added: number; skipped: number; originals: number }

/** mode "replace": thay toàn bộ; "merge": gộp, bỏ qua tài liệu trùng (cùng hash) nhưng bổ sung file gốc nếu tài liệu hiện có chưa có. Ghi trong một transaction nên lỗi sẽ hoàn tác. */
export async function restoreBackup(data: BackupFile, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const segsByDoc = new Map<number, SegmentRecord[]>();
  for (const s of data.segments) {
    const list = segsByDoc.get(s.docId) ?? [];
    list.push(s);
    segsByDoc.set(s.docId, list);
  }
  // Giải mã file gốc trước khi mở transaction (transaction IndexedDB không được chờ tác vụ bất đồng bộ ngoài Dexie).
  const originals = new Map<number, { type: string; blob: Blob }>();
  for (const f of data.files ?? []) originals.set(f.docId, { type: f.type, blob: await base64ToBlob(f.data, f.type) });

  const result = await db.transaction('rw', db.documents, db.segments, db.blobs, async () => {
    if (mode === 'replace') {
      await db.segments.clear();
      await db.blobs.clear();
      await db.documents.clear();
    }
    const existing = new Map((await db.documents.toArray()).map((d) => [d.hash, d.id as number]));
    let added = 0;
    let skipped = 0;
    let restoredOriginals = 0;
    for (const d of data.documents) {
      const oldId = d.id as number;
      const orig = originals.get(oldId);
      const existingId = existing.get(d.hash);
      if (existingId !== undefined) {
        skipped++;
        if (orig && !(await db.blobs.get(existingId))) {
          await db.blobs.put({ docId: existingId, type: orig.type, blob: orig.blob });
          restoredOriginals++;
        }
        continue;
      }
      const { id: _drop, ...rest } = d as DocRecord & { id: number };
      void _drop;
      const newId = await db.documents.add(rest);
      const segs = (segsByDoc.get(oldId) ?? []).map(({ docId: _d, id: _i, ...s }): SegmentRecord => ({ ...s, docId: newId }));
      await db.segments.bulkAdd(segs);
      if (orig) {
        await db.blobs.put({ docId: newId, type: orig.type, blob: orig.blob });
        restoredOriginals++;
      }
      existing.set(d.hash, newId);
      added++;
    }
    return { added, skipped, originals: restoredOriginals };
  });
  invalidateIndex();
  return result;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
