import { db } from '../database/db';
import { invalidateIndex } from './searchService';
import { SUPPORTED_EXTS } from '../utils/constants';
import type { BackupFile, DocRecord, FileExt, SegmentRecord } from '../types';

export async function exportBackup(): Promise<{ blob: Blob; filename: string; docs: number }> {
  const [documents, segments] = await Promise.all([db.documents.toArray(), db.segments.toArray()]);
  const data: BackupFile = { app: 'hrm-knowledge-search', version: 1, exportedAt: new Date().toISOString(), documents, segments };
  const stamp = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), filename: `hrm-backup-${stamp}.json`, docs: documents.length };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Kiểm tra cấu trúc file backup. Trả về dữ liệu hợp lệ hoặc ném lỗi tiếng Việt; không đụng đến dữ liệu hiện tại. */
export async function validateBackup(file: File): Promise<BackupFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  if (!isObj(raw) || raw.app !== 'hrm-knowledge-search') throw new Error('Đây không phải file backup của HRM Knowledge Search.');
  if (raw.version !== 1) throw new Error('Phiên bản backup không được hỗ trợ.');
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
  return raw as unknown as BackupFile;
}

export interface RestoreResult { added: number; skipped: number }

/** mode "replace": thay toàn bộ; "merge": gộp, bỏ qua tài liệu trùng (cùng hash). Chạy trong một transaction nên lỗi sẽ hoàn tác. */
export async function restoreBackup(data: BackupFile, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const segsByDoc = new Map<number, SegmentRecord[]>();
  for (const s of data.segments) {
    const list = segsByDoc.get(s.docId) ?? [];
    list.push(s);
    segsByDoc.set(s.docId, list);
  }
  const result = await db.transaction('rw', db.documents, db.segments, async () => {
    if (mode === 'replace') {
      await db.segments.clear();
      await db.documents.clear();
    }
    const existing = new Set((await db.documents.toArray()).map((d) => d.hash));
    let added = 0;
    let skipped = 0;
    for (const d of data.documents) {
      if (existing.has(d.hash)) { skipped++; continue; }
      const { id: oldId, ...rest } = d as DocRecord & { id: number };
      const newId = await db.documents.add(rest);
      const segs = (segsByDoc.get(oldId) ?? []).map(({ docId: _d, id: _i, ...s }): SegmentRecord => ({ ...s, docId: newId }));
      await db.segments.bulkAdd(segs);
      existing.add(d.hash);
      added++;
    }
    return { added, skipped };
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
