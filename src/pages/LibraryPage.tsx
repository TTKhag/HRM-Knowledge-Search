import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, ExtBadge, btnDanger, btnSecondary, selectCls } from '../components/ui';
import { IconTrash } from '../components/Icons';
import { db } from '../database/db';
import { useLive } from '../hooks/useLive';
import { clearLibrary, deleteDocument } from '../services/libraryService';
import { MODULES } from '../utils/constants';
import { errMsg, formatDate, formatSize, normalize } from '../utils/text';

export default function LibraryPage() {
  const { data: docs, error } = useLive(() => db.documents.orderBy('importedAt').reverse().toArray());
  const [name, setName] = useState('');
  const [module, setModule] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const list = useMemo(() => {
    const n = normalize(name.trim());
    return (docs ?? []).filter((d) => (!module || d.module === module) && (!n || normalize(d.name).includes(n)));
  }, [docs, name, module]);

  const remove = async (id: number, title: string) => {
    if (!window.confirm(`Xóa tài liệu "${title}"? Thao tác này không thể hoàn tác.`)) return;
    try { await deleteDocument(id); setMsg({ kind: 'success', text: `Đã xóa "${title}".` }); }
    catch (e) { setMsg({ kind: 'error', text: `Không xóa được: ${errMsg(e)}` }); }
  };

  const removeAll = async () => {
    if (!docs?.length) return;
    if (!window.confirm(`Xóa TOÀN BỘ ${docs.length} tài liệu trong thư viện? Nên sao lưu trước. Thao tác này không thể hoàn tác.`)) return;
    if (!window.confirm('Xác nhận lần cuối: xóa toàn bộ thư viện?')) return;
    try { await clearLibrary(); setMsg({ kind: 'success', text: 'Đã xóa toàn bộ thư viện.' }); }
    catch (e) { setMsg({ kind: 'error', text: `Không xóa được: ${errMsg(e)}` }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tìm theo tên tài liệu…" className="min-w-[180px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-navy-600 focus:outline-none" />
        <select className={selectCls} value={module} onChange={(e) => setModule(e.target.value)} aria-label="Lọc theo phân hệ">
          <option value="">Tất cả phân hệ</option>
          {MODULES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button className={btnDanger} disabled={!docs?.length} onClick={removeAll}>Xóa toàn bộ thư viện</button>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {error && <Alert kind="error">Lỗi đọc dữ liệu: {error}</Alert>}
      <p className="text-sm text-gray-600">{list.length}/{docs?.length ?? 0} tài liệu</p>

      <Card className="divide-y divide-gray-100 !p-0">
        {list.length === 0 && <p className="p-4 text-sm text-gray-500">{docs?.length ? 'Không có tài liệu khớp bộ lọc.' : <>Thư viện trống. <Link to="/import" className="text-navy-700 underline">Import tài liệu</Link>.</>}</p>}
        {list.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <Link to={`/tai-lieu/${d.id}`} className="block truncate font-medium text-navy-800 hover:underline">{d.name}</Link>
              <span className="text-xs text-gray-500">{formatSize(d.size)} · {d.segmentCount} đoạn · import {formatDate(d.importedAt)}</span>
            </div>
            <ExtBadge ext={d.ext} /> <Badge>{d.module}</Badge>
            <Link to={`/tai-lieu/${d.id}`} className={btnSecondary + ' !px-3 !py-1'}>Xem</Link>
            <button className="rounded p-2 text-red-700 hover:bg-red-50" onClick={() => remove(d.id as number, d.name)} aria-label={`Xóa ${d.name}`}><IconTrash className="h-4 w-4" /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}
