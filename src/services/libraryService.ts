import { db } from '../database/db';
import { invalidateIndex } from './searchService';
import { extract } from './extractors';
import { MIME_BY_EXT, SUPPORTED_EXTS } from '../utils/constants';
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

export type ImportOutcome =
  | { kind: 'done'; id: number; segments: number; originalSaved: boolean }
  | { kind: 'duplicate'; existingName: string }
  | { kind: 'attached'; existingName: string };

async function storeOriginal(docId: number, file: Blob, ext: FileExt): Promise<void> {
  const type = MIME_BY_EXT[ext];
  await db.blobs.put({ docId, type, blob: new Blob([file], { type }) });
}

/** Trích xuất lại đoạn nội dung (dùng khi bổ sung file gốc cho tài liệu Excel cũ để số hàng khớp bản gốc). */
async function refreshSegments(docId: number, file: File, ext: FileExt): Promise<void> {
  try {
    const segs = await extract(file, ext);
    if (!segs.length) return;
    await db.transaction('rw', db.documents, db.segments, async () => {
      await db.segments.where('docId').equals(docId).delete();
      await db.segments.bulkAdd(segs.map((s, index): SegmentRecord => ({ docId, index, label: s.label, text: s.text })));
      await db.documents.update(docId, { segmentCount: segs.length });
    });
    invalidateIndex();
  } catch {
    /* giữ nguyên dữ liệu cũ nếu không trích xuất lại được */
  }
}

/** Import một file: kiểm tra định dạng, trùng lặp, trích xuất, lưu nội dung tìm kiếm + file gốc. Ném lỗi (tiếng Việt) nếu thất bại. */
export async function importFile(file: File, module: string): Promise<ImportOutcome> {
  const ext = getExt(file.name) as FileExt;
  if (!SUPPORTED_EXTS.includes(ext)) {
    throw new Error(`Định dạng ".${ext || '?'}" chưa được hỗ trợ (chỉ hỗ trợ DOCX, PDF, XLSX, TXT).`);
  }
  const hash = await hashFile(file);
  const dup = await db.documents.where('hash').equals(hash).first();
  if (dup) {
    const id = dup.id as number;
    if (await db.blobs.get(id)) return { kind: 'duplicate', existingName: dup.name };
    // Tài liệu import từ phiên bản cũ (chưa có file gốc): bổ sung file gốc thay vì báo trùng.
    try {
      await storeOriginal(id, file, ext);
    } catch (e) {
      throw new Error(`Không lưu được file gốc: ${errMsg(e)}`);
    }
    if (ext === 'xlsx') await refreshSegments(id, file, ext);
    return { kind: 'attached', existingName: dup.name };
  }

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

  // File gốc lưu riêng: nếu trình duyệt hết dung lượng, vẫn giữ được dữ liệu tìm kiếm.
  let originalSaved = true;
  try {
    await storeOriginal(id, file, ext);
  } catch {
    originalSaved = false;
  }
  return { kind: 'done', id, segments: segments.length, originalSaved };
}

export async function deleteDocument(id: number): Promise<void> {
  await db.transaction('rw', db.documents, db.segments, db.blobs, async () => {
    await db.segments.where('docId').equals(id).delete();
    await db.blobs.delete(id);
    await db.documents.delete(id);
  });
  invalidateIndex();
}

export async function clearLibrary(): Promise<void> {
  await db.transaction('rw', db.documents, db.segments, db.blobs, async () => {
    await db.segments.clear();
    await db.blobs.clear();
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

/** File gốc của tài liệu, hoặc null nếu tài liệu được import trước khi có tính năng lưu file gốc. */
export async function getOriginal(id: number): Promise<Blob | null> {
  return (await db.blobs.get(id))?.blob ?? null;
}
