/** Vị trí cần mở trong bản gốc. nonce thay đổi mỗi lần yêu cầu để cuộn lại ngay cả khi vị trí không đổi. */
export interface ViewTarget { page?: number; sheet?: string; row?: number; text?: string; nonce: number }

export interface ViewerProps {
  blob: Blob;
  terms: string[];
  target: ViewTarget | null;
  onError: (message: string) => void;
}
