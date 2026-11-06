/** Nạp PDF.js (bản legacy, tương thích trình duyệt cũ) và cấu hình worker. Dùng chung cho import và xem bản gốc. */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}
