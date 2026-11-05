import Dexie, { type Table } from 'dexie';
import type { DocRecord, SegmentRecord } from '../types';

class HrmDB extends Dexie {
  documents!: Table<DocRecord, number>;
  segments!: Table<SegmentRecord, number>;

  constructor() {
    super('hrm-knowledge-search');
    this.version(1).stores({
      documents: '++id, name, module, ext, hash, importedAt',
      segments: '++id, docId',
    });
  }
}

export const db = new HrmDB();
