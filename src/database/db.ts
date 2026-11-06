import Dexie, { type Table } from 'dexie';
import type { DocRecord, OriginalRecord, SegmentRecord } from '../types';

class HrmDB extends Dexie {
  documents!: Table<DocRecord, number>;
  segments!: Table<SegmentRecord, number>;
  blobs!: Table<OriginalRecord, number>;

  constructor() {
    super('hrm-knowledge-search');
    this.version(1).stores({
      documents: '++id, name, module, ext, hash, importedAt',
      segments: '++id, docId',
    });
    // v2: lưu file gốc (Blob) ở bảng riêng để danh sách/tìm kiếm không phải tải file nặng. Dữ liệu v1 được giữ nguyên.
    this.version(2).stores({
      documents: '++id, name, module, ext, hash, importedAt',
      segments: '++id, docId',
      blobs: 'docId',
    });
  }
}

export const db = new HrmDB();
