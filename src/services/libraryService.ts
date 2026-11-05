import { db } from '../database/db';
import { invalidateIndex } from './searchService';
import { extract } from './extractors';
import { SUPPORTED_EXTS } from '../utils/constants';
import { errMsg, getExt } from '../utils/text';
import type { DocRecord, ExtractedSegment, FileExt, SegmentRecord } from '../types';

export async function hashFile(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `weak-${file.name}-${file.size}-${file.lastModified}`;
  }
}

export type ImportOutcome = { kind: 'done'; id: number; segments: number } | { kind: 'duplicate'; existingName: string };

/** Import một file: kiểm tra định dạng, trùng lặp, trích xuất và lưu vào IndexedDB. Ném lỗi (tiếng Việt) nếu thất bại. */
export async function importFile(file: File, module: string): Promise<ImportOutcome> {
  const ext = getExt(file.name) as FileExt;
  if (!SUPPORTED_EXTS.includes(ext)) {
    throw new Error(`Định dạng ".${ext || '?'}" chưa được hỗ trợ (chỉ hỗ trợ DOCX, PDF, XLSX, TXT).`);
  }
  const hash = await hashFile(file);
  const dup = await db.documents.where('hash').equals(hash).first();
  if (dup) return { kind: 'duplicate', existingName: dup.name };

  let segments: ExtractedSegment[];
  try {
    segments = await extract(file, ext);
  } catch (e) {
    throw new Error(`Không đọc được file: ${errMsg(e)}`);
  }
  if (!segments.length) {
    throw new Error('Không trích xuất được nội dung văn bản (file rỗng hoặc là PDF dạng ảnh quét).');
  }

  const id = await db.transaction('rw', db.documents, db.segments, async () => {
    const docId = await db.documents.add({
      name: file.name, ext, module, size: file.size, hash, importedAt: Date.now(), segmentCount: segments.length,
    });
    await db.segments.bulkAdd(segments.map((s, index): SegmentRecord => ({ docId, index, label: s.label, text: s.text })));
    return docId;
  });
  invalidateIndex();
  return { kind: 'done', id, segments: segments.length };
}

export async function deleteDocument(id: number): Promise<void> {
  await db.transaction('rw', db.documents, db.segments, async () => {
    await db.segments.where('docId').equals(id).delete();
    await db.documents.delete(id);
  });
  invalidateIndex();
}

export async function clearLibrary(): Promise<void> {
  await db.transaction('rw', db.documents, db.segments, async () => {
    await db.segments.clear();
    await db.documents.clear();
  });
  invalidateIndex();
}

export async function updateDocumentModule(id: number, module: string): Promise<void> {
  await db.documents.update(id, { module });
  invalidateIndex();
}

export async function getDocument(id: number): Promise<{ doc: DocRecord; segments: SegmentRecord[] } | null> {
  const doc = await db.documents.get(id);
  if (!doc) return null;
  const segments = await db.segments.where('docId').equals(id).sortBy('index');
  return { doc, segments };
}
