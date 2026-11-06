import { Link, useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import Highlight from '../components/Highlight';
import { Alert, Badge, Card, ExtBadge, btnSecondary, selectCls } from '../components/ui';
import { useSearch } from '../hooks/useSearch';
import { EXT_LABEL, MODULES, SUPPORTED_EXTS } from '../utils/constants';
import { relevanceLabel, snippetWindow } from '../utils/ranking';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const module = params.get('module') ?? '';
  const ext = params.get('ext') ?? '';
  const { results, loading, error } = useSearch(q, module, ext);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const detailLink = (r: { docId: number; segmentId: number; occurrence: number; len: number }) =>
    `/tai-lieu/${r.docId}?seg=${r.segmentId}&occ=${r.occurrence}&len=${r.len}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <div className="space-y-4">
      <SearchBar key={q} initial={q} onSubmit={(v) => update('q', v)} />
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={module} onChange={(e) => update('module', e.target.value)} aria-label="Lọc theo phân hệ">
          <option value="">Tất cả phân hệ</option>
          {MODULES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={selectCls} value={ext} onChange={(e) => update('ext', e.target.value)} aria-label="Lọc theo loại tài liệu">
          <option value="">Tất cả loại file</option>
          {SUPPORTED_EXTS.map((x) => <option key={x} value={x}>{EXT_LABEL[x]}</option>)}
        </select>
        {(module || ext) && <button className={btnSecondary} onClick={() => { const n = new URLSearchParams(params); n.delete('module'); n.delete('ext'); setParams(n, { replace: true }); }}>Bỏ lọc</button>}
      </div>

      {error && <Alert kind="error">Lỗi tìm kiếm: {error}</Alert>}
      {!q && <Alert kind="info">Nhập từ khóa để tìm trong nội dung tài liệu. Ví dụ: "tinh luong", "hợp đồng thử việc".</Alert>}
      {q && loading && <p className="text-sm text-gray-600">Đang tìm…</p>}
      {q && !loading && !error && (
        <p className="text-sm text-gray-600">
          {results.length ? <>Tìm thấy <strong>{results.length}</strong> vị trí khớp cụm từ liền nhau, độ liên quan từ 30% trở lên (xếp từ cao xuống thấp){results.length >= 200 ? ', hiển thị tối đa 200' : ''}.</> : 'Không tìm thấy kết quả phù hợp.'}
        </p>
      )}

      <ul className="space-y-3">
        {results.map((r) => {
          const w = snippetWindow(r.text, { start: r.start, end: r.end });
          const ranges = r.ranges.filter((x) => x.start >= w.start && x.end <= w.end).map((x) => ({ start: x.start - w.start, end: x.end - w.start }));
          return (
            <li key={`${r.segmentId}-${r.occurrence}`}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/tai-lieu/${r.docId}`} className="font-semibold text-navy-800 hover:underline">{r.docName}</Link>
                  <Badge>{r.module}</Badge> <ExtBadge ext={r.ext} />
                  <span className="ml-auto text-xs font-medium text-navy-700" title={relevanceLabel(r.relevance)}>Khớp {r.relevance}% · {relevanceLabel(r.relevance)}</span>
                </div>
                <p className="text-xs text-gray-600">Vị trí: {r.label}{r.ranges.length > 1 ? ` (lần xuất hiện ${r.occurrence + 1}/${r.ranges.length} trong mục này)` : ''}</p>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-800">
                  {w.start > 0 && '…'}<Highlight text={r.text.slice(w.start, w.end)} ranges={ranges} />{w.end < r.text.length && '…'}
                </p>
                <Link to={detailLink(r)} className="inline-block rounded border border-navy-600 px-3 py-1 text-sm text-navy-700 hover:bg-navy-50">Xem chi tiết</Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
