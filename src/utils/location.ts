export interface SegmentLocation { page?: number; sheet?: string; row?: number }

/** Suy ra vị trí nguồn từ nhãn đoạn ("Trang 3", 'Sheet "A", hàng 12'). Dùng được cả cho dữ liệu import trước khi nâng cấp. */
export function parseLocation(label: string): SegmentLocation {
  const page = /^Trang (\d+)/.exec(label);
  if (page) return { page: Number(page[1]) };
  const cell = /^Sheet "(.*)", hàng (\d+)$/.exec(label);
  if (cell) return { sheet: cell[1], row: Number(cell[2]) };
  return {};
}
