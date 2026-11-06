import type { ExtractedSegment, FileExt } from '../types';
import { chunkLines, cleanText } from '../utils/text';
import { loadPdfjs } from './pdfjs';

async function extractTxt(file: File): Promise<ExtractedSegment[]> {
  const text = (await file.text()).replace(/\r\n?/g, '\n');
  const chunks = chunkLines(text.split(/\n+/));
  return chunks.map((t, i) => ({ label: `Đoạn ${i + 1}`, text: t }));
}

async function extractPdf(file: File): Promise<ExtractedSegment[]> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: ExtractedSegment[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      text = cleanText(text);
      if (text) out.push({ label: `Trang ${p}`, text });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return out;
}

async function extractDocx(file: File): Promise<ExtractedSegment[]> {
  const mod = (await import('mammoth/mammoth.browser')) as unknown as { default?: typeof import('mammoth/mammoth.browser') } & typeof import('mammoth/mammoth.browser');
  const mammoth = mod.default ?? mod;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const out: ExtractedSegment[] = [];
  let heading = 'Đầu tài liệu';
  let lines: string[] = [];
  const flush = () => {
    chunkLines(lines).forEach((t, i) => out.push({ label: i === 0 ? heading : `${heading} (tiếp)`, text: t }));
    lines = [];
  };

  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const h = cleanText(el.textContent ?? '');
      if (h) heading = h.length > 120 ? h.slice(0, 120) + '…' : h;
      if (h) lines.push(h);
    } else if (tag === 'table') {
      el.querySelectorAll('tr').forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('th,td')).map((c) => cleanText(c.textContent ?? ''));
        const row = cells.filter(Boolean).join(' | ');
        if (row) lines.push(row);
      });
    } else if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li) => {
        const t = cleanText(li.textContent ?? '');
        if (t) lines.push('• ' + t);
      });
    } else {
      const t = cleanText(el.textContent ?? '');
      if (t) lines.push(t);
    }
  }
  flush();
  return out;
}

async function extractXlsx(file: File): Promise<ExtractedSegment[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const out: ExtractedSegment[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    // Số hàng phải là số hàng thật trong sheet (để mở đúng vị trí ở bản gốc), kể cả khi có hàng trống.
    const firstRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: true });
    rows.forEach((row, idx) => {
      const text = cleanText(row.map((c) => String(c ?? '').trim()).filter(Boolean).join(' | '));
      if (text) out.push({ label: `Sheet "${sheetName}", hàng ${firstRow + idx + 1}`, text });
    });
  }
  return out;
}

export async function extract(file: File, ext: FileExt): Promise<ExtractedSegment[]> {
  switch (ext) {
    case 'txt': return extractTxt(file);
    case 'pdf': return extractPdf(file);
    case 'docx': return extractDocx(file);
    case 'xlsx': return extractXlsx(file);
  }
}
