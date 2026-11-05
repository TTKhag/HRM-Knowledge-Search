import { Link, useNavigate } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import { Card, ExtBadge, Badge } from '../components/ui';
import { db } from '../database/db';
import { useLive } from '../hooks/useLive';
import { MODULES } from '../utils/constants';
import { formatDate } from '../utils/text';

export default function HomePage() {
  const navigate = useNavigate();
  const { data } = useLive(async () => {
    const docs = await db.documents.toArray();
    const counts: Record<string, number> = {};
    docs.forEach((d) => { counts[d.module] = (counts[d.module] ?? 0) + 1; });
    const recent = [...docs].sort((a, b) => b.importedAt - a.importedAt).slice(0, 6);
    return { total: docs.length, counts, recent };
  });

  const go = (q: string) => navigate(q ? `/tim-kiem?q=${encodeURIComponent(q)}` : '/tim-kiem');

  return (
    <div className="space-y-6">
      <section className="pt-4 md:pt-8">
        <h2 className="mb-1 text-xl font-semibold text-navy-800">Tra cứu tài liệu nghiệp vụ HRM</h2>
        <p className="mb-4 text-sm text-gray-600">Tìm nội dung bên trong các tài liệu đã import. Hỗ trợ gõ tiếng Việt có dấu hoặc không dấu.</p>
        <SearchBar large onSubmit={go} />
        <p className="mt-3 text-sm text-gray-600">
          Đã import: <strong className="text-navy-800">{data?.total ?? 0}</strong> tài liệu
          {data?.total === 0 && <> — <Link to="/import" className="text-navy-700 underline">import tài liệu đầu tiên</Link></>}
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase text-gray-600">Phân hệ</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {MODULES.map((m) => (
            <Link key={m} to={`/tim-kiem?module=${encodeURIComponent(m)}`} className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-sm hover:border-navy-600">
              <span>{m}</span>
              <span className="text-xs text-gray-500">{data?.counts[m] ?? 0}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase text-gray-600">Tài liệu thêm gần đây</h3>
        <Card className="divide-y divide-gray-100 !p-0">
          {data?.recent.length ? data.recent.map((d) => (
            <Link key={d.id} to={`/tai-lieu/${d.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm hover:bg-gray-50">
              <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
              <ExtBadge ext={d.ext} /> <Badge>{d.module}</Badge>
              <span className="text-xs text-gray-500">{formatDate(d.importedAt)}</span>
            </Link>
          )) : <p className="p-4 text-sm text-gray-500">Chưa có tài liệu nào.</p>}
        </Card>
      </section>
    </div>
  );
}
