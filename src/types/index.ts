export type FileExt = 'docx' | 'pdf' | 'xlsx' | 'txt';

export interface DocRecord {
  id?: number;
  name: string;
  ext: FileExt;
  module: string;
  size: number;
  hash: string;
  importedAt: number;
  segmentCount: number;
}

/** Một đoạn nội dung đã trích xuất, kèm vị trí nguồn (trang PDF, heading DOCX, sheet/hàng Excel). */
export interface SegmentRecord {
  id?: number;
  docId: number;
  index: number;
  label: string;
  text: string;
}

export interface ExtractedSegment {
  label: string;
  text: string;
}

export interface SearchHit {
  segmentId: number;
  docId: number;
  score: number;
  module: string;
  ext: FileExt;
}

export interface SearchResult extends SearchHit {
  docName: string;
  label: string;
  text: string;
}

export interface BackupFile {
  app: 'hrm-knowledge-search';
  version: 1;
  exportedAt: string;
  documents: DocRecord[];
  segments: SegmentRecord[];
}

export type ImportStatus = 'waiting' | 'processing' | 'done' | 'duplicate' | 'error';
