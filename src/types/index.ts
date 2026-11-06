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

/** File gốc của tài liệu (khóa chính = id tài liệu). */
export interface OriginalRecord {
  docId: number;
  type: string;
  blob: Blob;
}

export interface ExtractedSegment {
  label: string;
  text: string;
}

export interface SearchHit {
  segmentId: number;
  docId: number;
  score: number;
  /** Độ liên quan 30–100 (%). */
  relevance: number;
  /** Thứ tự lần xuất hiện trong đoạn (mỗi lần xuất hiện là một kết quả riêng). */
  occurrence: number;
  /** Số từ liền nhau khớp được. */
  len: number;
  /** Vị trí ký tự của lần xuất hiện này trong đoạn. */
  start: number;
  end: number;
  /** Mọi lần xuất hiện tốt nhất trong đoạn (để tô sáng đoạn trích). */
  ranges: { start: number; end: number }[];
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
  version: 1 | 2;
  exportedAt: string;
  documents: DocRecord[];
  segments: SegmentRecord[];
  /** Từ version 2: file gốc mã hóa base64. */
  files?: BackupOriginal[];
}

export interface BackupOriginal {
  docId: number;
  type: string;
  data: string;
}

export type ImportStatus = 'waiting' | 'processing' | 'done' | 'duplicate' | 'error';
