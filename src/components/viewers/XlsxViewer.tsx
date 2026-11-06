import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Highlight from '../Highlight';
import { btnSecondary } from '../ui';
import { errMsg } from '../../utils/text';
import type { ViewerProps } from './types';

const PAGE_ROWS = 500;
const MAX_COLS = 200;

interface Model { rows: number; cols: number; widths: number[]; merges: Map<string, { rs: number; cs: number }>; covered: Set<string> }

function buildModel(ws: XLSX.WorkSheet): Model {
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
  const cols = Math.min(range.e.c + 1, MAX_COLS);
  const widths = Array.from({ length: cols }, (_, c) => {
    const col = ws['!cols']?.[c];
    const w = col?.wpx ?? (col?.wch ? col.wch * 7 + 10 : col?.width ? col.width * 7 : 90);
    return Math.min(400, Math.max(40, Math.round(w)));
  });
  const merges = new Map<string, { rs: number; cs: number }>();
  const covered = new Set<string>();
  for (const m of ws['!merges'] ?? []) {
    const rs = m.e.r - m.s.r + 1;
    const cs = m.e.c - m.s.c + 1;
    merges.set(`${m.s.r},${m.s.c}`, { rs, cs: Math.min(cs, Math.max(1, cols - m.s.c)) });
    if (rs * cs > 100000) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
  }
  return { rows: range.e.r + 1, cols, widths, merges, covered };
}

/** Bảng tính giữ nguyên hàng/cột, ô gộp, độ rộng cột và định dạng hiển thị của giá trị (ngày, số, %...). */
export default function XlsxViewer({ blob, terms, target, onError }: ViewerProps) {
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [limit, setLimit] = useState(PAGE_ROWS);
  const scrolled = useRef(0);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array', cellStyles: true });
        if (cancelled) return;
        setWb(w);
        setSheet(w.SheetNames[0] ?? '');
      } catch (e) {
        if (!cancelled) errRef.current(errMsg(e));
      }
    })();
    return () => { cancelled = true; };
  }, [blob]);

  useEffect(() => {
    if (!wb || !target?.sheet || !wb.SheetNames.includes(target.sheet)) return;
    setSheet(target.sheet);
    if (target.row) setLimit((l) => Math.max(l, (target.row as number) + 100));
  }, [wb, target?.nonce]);

  useEffect(() => {
    if (!wb || !target?.row || scrolled.current === target.nonce) return;
    const id = window.setTimeout(() => {
      const el = document.getElementById(`xl-row-${target.row}`);
      if (el) { el.scrollIntoView({ block: 'center' }); scrolled.current = target.nonce; }
    }, 60);
    return () => window.clearTimeout(id);
  }, [wb, sheet, limit, target?.nonce]);

  const ws = wb && sheet ? wb.Sheets[sheet] : undefined;
  const model = useMemo(() => (ws ? buildModel(ws) : null), [ws]);

  if (!wb) return <p className="p-4 text-sm text-gray-600">Đang đọc bảng tính…</p>;
  if (!ws || !model) return <p className="p-4 text-sm text-gray-600">Bảng tính không có sheet nào.</p>;

  const shown = Math.min(model.rows, limit);
  const totalW = 48 + model.widths.reduce((a, b) => a + b, 0);
  const targetRow = target?.sheet === sheet ? target.row : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {wb.SheetNames.map((n) => (
          <button key={n} onClick={() => { setSheet(n); setLimit(PAGE_ROWS); }}
            className={`rounded border px-3 py-1 text-sm ${n === sheet ? 'border-navy-600 bg-navy-50 font-semibold text-navy-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}>{n}</button>
        ))}
      </div>
      <div className="max-h-[75vh] overflow-auto rounded border border-gray-300 bg-white">
        <table className="border-collapse text-sm" style={{ tableLayout: 'fixed', width: totalW }}>
          <colgroup>
            <col style={{ width: 48 }} />
            {model.widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border border-gray-300 bg-gray-100" />
              {model.widths.map((_, c) => (
                <th key={c} className="sticky top-0 z-10 border border-gray-300 bg-gray-100 px-1 py-1 text-xs font-medium text-gray-600">{XLSX.utils.encode_col(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: shown }, (_, r) => (
              <tr key={r} id={`xl-row-${r + 1}`} className={targetRow === r + 1 ? 'hrm-target-row' : undefined}>
                <th className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-1 text-center text-xs font-medium text-gray-600">{r + 1}</th>
                {model.widths.map((_, c) => {
                  const key = `${r},${c}`;
                  if (model.covered.has(key)) return null;
                  const m = model.merges.get(key);
                  const cell = ws[XLSX.utils.encode_cell({ r, c })];
                  const text = cell ? (cell.w ?? String(cell.v ?? '')) : '';
                  return (
                    <td key={c} rowSpan={m?.rs} colSpan={m?.cs}
                      className={`overflow-hidden whitespace-pre-wrap break-words border border-gray-300 px-2 py-1 align-top ${cell?.t === 'n' ? 'text-right' : ''}`}>
                      <Highlight text={text} terms={terms} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
        <span>Hiển thị {shown}/{model.rows} hàng{model.cols >= MAX_COLS ? ` (tối đa ${MAX_COLS} cột đầu)` : ''}.</span>
        {shown < model.rows && <button className={btnSecondary + ' !py-1'} onClick={() => setLimit((l) => l + PAGE_ROWS)}>Hiển thị thêm {Math.min(PAGE_ROWS, model.rows - shown)} hàng</button>}
      </div>
    </div>
  );
}
