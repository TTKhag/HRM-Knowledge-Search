import type { FileExt } from '../types';

export const MODULES = [
  'Hệ thống', 'Thông tin nhân sự', 'Tiền lương', 'Nhân viên', 'Chấm công', 'Hợp đồng', 'Bảo hiểm xã hội',
  'Tuyển dụng', 'Booking', 'Công việc', 'KPI', 'Đào tạo', 'Đánh giá', 'Khác',
] as const;

export const SUPPORTED_EXTS: FileExt[] = ['docx', 'pdf', 'xlsx', 'txt'];
export const ACCEPT = '.docx,.pdf,.xlsx,.txt';
export const EXT_LABEL: Record<FileExt, string> = { docx: 'DOCX', pdf: 'PDF', xlsx: 'XLSX', txt: 'TXT' };
export const MAX_SEGMENT_CHARS = 1200;
export const MAX_RESULTS = 100;
