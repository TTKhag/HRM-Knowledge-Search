/** Ngữ cảnh một lần xuất hiện (các từ liền trước/sau) để định vị đúng lần xuất hiện trong bản gốc DOCX. */
export interface OccCtx { before: string[]; after: string[]; text: string }

/** Vị trí cần mở trong bản gốc. nonce thay đổi mỗi lần yêu cầu để cuộn lại ngay cả khi vị trí không đổi. */
export interface ViewTarget {
  page?: number;
  sheet?: string;
  row?: number;
  /** Thứ tự lần xuất hiện trong đoạn/trang. */
  occ?: number;
  /** Danh sách ngữ cảnh mọi lần xuất hiện trong tài liệu và chỉ số lần xuất hiện được chọn. */
  ctx?: { index: number; list: OccCtx[] };
  nonce: number;
}

export interface ViewerProps {
  blob: Blob;
  query: string;
  minLen: number;
  target: ViewTarget | null;
  onError: (message: string) => void;
}
