import { useRef, useState } from 'react';
import { Alert, Card, btnPrimary, btnSecondary } from '../components/ui';
import { downloadBlob, exportBackup, restoreBackup, validateBackup } from '../services/backupService';
import { errMsg } from '../utils/text';
import type { BackupFile } from '../types';

type Msg = { kind: 'error' | 'success'; text: string } | null;

export default function BackupPage() {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; data: BackupFile } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy(true);
    try {
      const { blob, filename, docs } = await exportBackup();
      downloadBlob(blob, filename);
      setMsg({ kind: 'success', text: `Đã xuất ${docs} tài liệu ra file ${filename}.` });
    } catch (e) { setMsg({ kind: 'error', text: `Không xuất được backup: ${errMsg(e)}` }); }
    finally { setBusy(false); }
  };

  const pick = async (file: File) => {
    setMsg(null); setPending(null); setBusy(true);
    try { setPending({ name: file.name, data: await validateBackup(file) }); }
    catch (e) { setMsg({ kind: 'error', text: `File backup không hợp lệ — dữ liệu hiện tại được giữ nguyên. ${errMsg(e)}` }); }
    finally { setBusy(false); }
  };

  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    if (mode === 'replace' && !window.confirm('Thay thế TOÀN BỘ dữ liệu hiện tại bằng dữ liệu trong backup?')) return;
    setBusy(true);
    try {
      const r = await restoreBackup(pending.data, mode);
      setMsg({ kind: 'success', text: `Khôi phục xong: thêm ${r.added} tài liệu${r.skipped ? `, bỏ qua ${r.skipped} tài liệu trùng` : ''}.` });
      setPending(null);
    } catch (e) { setMsg({ kind: 'error', text: `Khôi phục thất bại, dữ liệu hiện tại không bị thay đổi. ${errMsg(e)}` }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card className="space-y-2">
        <h2 className="font-semibold text-navy-800">Sao lưu (Export)</h2>
        <p className="text-sm text-gray-600">Xuất toàn bộ thư viện thành một file JSON để lưu trữ hoặc chuyển sang máy khác. File này chứa nội dung tài liệu — không đưa lên repository công khai.</p>
        <button className={btnPrimary} disabled={busy} onClick={doExport}>Tải file backup</button>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold text-navy-800">Khôi phục (Import)</h2>
        <p className="text-sm text-gray-600">Chọn file backup. Hệ thống kiểm tra dữ liệu trước; nếu file lỗi, dữ liệu hiện tại không bị ảnh hưởng.</p>
        <button className={btnSecondary} disabled={busy} onClick={() => input.current?.click()}>Chọn file backup…</button>
        <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
        {pending && (
          <div className="space-y-2 rounded border border-navy-100 bg-navy-50 p-3 text-sm">
            <p>File <strong>{pending.name}</strong> hợp lệ: {pending.data.documents.length} tài liệu, {pending.data.segments.length} đoạn nội dung (xuất lúc {new Date(pending.data.exportedAt).toLocaleString('vi-VN')}).</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} disabled={busy} onClick={() => doRestore('merge')}>Gộp vào thư viện hiện tại</button>
              <button className={btnSecondary} disabled={busy} onClick={() => doRestore('replace')}>Thay thế toàn bộ</button>
              <button className={btnSecondary} disabled={busy} onClick={() => setPending(null)}>Hủy</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
