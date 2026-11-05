import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, btnPrimary, btnSecondary, selectCls } from '../components/ui';
import { IconUpload } from '../components/Icons';
import { importFile } from '../services/libraryService';
import { ACCEPT, MODULES } from '../utils/constants';
import { errMsg, formatSize } from '../utils/text';
import type { ImportStatus } from '../types';

interface Item { key: string; file: File; module: string; status: ImportStatus; message?: string }

const STATUS: Record<ImportStatus, { text: string; cls: string }> = {
  waiting: { text: 'Chờ', cls: 'text-gray-600' },
  processing: { text: 'Đang xử lý…', cls: 'text-navy-700' },
  done: { text: 'Hoàn tất', cls: 'text-green-700' },
  duplicate: { text: 'Trùng lặp', cls: 'text-amber-700' },
  error: { text: 'Lỗi', cls: 'text-red-700' },
};

export default function ImportPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [defaultModule, setDefaultModule] = useState<string>('Khác');
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const addFiles = (list: FileList | File[]) => {
    const added = Array.from(list).map((file, n) => ({
      key: `${Date.now()}-${n}-${file.name}`, file, module: defaultModule, status: 'waiting' as ImportStatus,
    }));
    setItems((cur) => [...cur, ...added]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const start = async () => {
    setRunning(true);
    for (const it of items.filter((i) => i.status === 'waiting')) {
      patch(it.key, { status: 'processing' });
      try {
        const r = await importFile(it.file, it.module);
        if (r.kind === 'duplicate') patch(it.key, { status: 'duplicate', message: `Trùng với tài liệu đã có: "${r.existingName}". Đã bỏ qua.` });
        else patch(it.key, { status: 'done', message: `Đã lưu ${r.segments} đoạn nội dung.` });
      } catch (e) {
        patch(it.key, { status: 'error', message: errMsg(e) });
      }
    }
    setRunning(false);
  };

  const finished = items.filter((i) => ['done', 'duplicate', 'error'].includes(i.status)).length;
  const pending = items.filter((i) => i.status === 'waiting').length;
  const pct = items.length ? Math.round((finished / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded border-2 border-dashed px-4 py-10 text-center ${drag ? 'border-navy-600 bg-navy-50' : 'border-gray-300 bg-white'}`}
      >
        <IconUpload className="h-8 w-8 text-navy-700" />
        <p className="text-sm text-gray-700">Kéo thả file vào đây hoặc</p>
        <button className={btnPrimary} onClick={() => input.current?.click()}>Chọn file</button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        <p className="text-xs text-gray-500">Hỗ trợ DOCX, PDF, XLSX, TXT. Xử lý hoàn toàn trên trình duyệt, không upload lên server.</p>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700" htmlFor="defmod">Phân hệ cho file mới thêm:</label>
        <select id="defmod" className={selectCls} value={defaultModule} onChange={(e) => setDefaultModule(e.target.value)}>
          {MODULES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="text-xs text-gray-500">(có thể đổi riêng từng file trước khi bắt đầu)</span>
      </Card>

      {items.length > 0 && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-navy-600" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm text-gray-700">{finished}/{items.length} file</span>
            <button className={btnPrimary} disabled={running || pending === 0} onClick={start}>{running ? 'Đang import…' : `Bắt đầu import (${pending})`}</button>
            <button className={btnSecondary} disabled={running} onClick={() => setItems((c) => c.filter((i) => i.status === 'waiting' || i.status === 'processing'))}>Xóa mục đã xong</button>
          </div>
          <ul className="divide-y divide-gray-100">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{it.file.name} <span className="text-xs text-gray-500">({formatSize(it.file.size)})</span></span>
                <select className={selectCls} disabled={it.status !== 'waiting'} value={it.module} onChange={(e) => patch(it.key, { module: e.target.value })} aria-label="Phân hệ">
                  {MODULES.map((m) => <option key={m}>{m}</option>)}
                </select>
                <span className={`w-24 text-right font-medium ${STATUS[it.status].cls}`}>{STATUS[it.status].text}</span>
                {it.message && <span className={`w-full text-xs ${STATUS[it.status].cls}`}>{it.message}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {finished > 0 && !running && (
        <Alert kind="info">Import xong. <Link to="/thu-vien" className="underline">Xem thư viện</Link> hoặc <Link to="/tim-kiem" className="underline">bắt đầu tìm kiếm</Link>.</Alert>
      )}
    </div>
  );
}
