import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IconBackup, IconClose, IconHome, IconLibrary, IconMenu, IconSearch, IconUpload } from './Icons';

const NAV = [
  { to: '/', label: 'Trang chủ', icon: IconHome, end: true },
  { to: '/tim-kiem', label: 'Tìm kiếm', icon: IconSearch },
  { to: '/import', label: 'Import tài liệu', icon: IconUpload },
  { to: '/thu-vien', label: 'Thư viện', icon: IconLibrary },
  { to: '/sao-luu', label: 'Sao lưu & Khôi phục', icon: IconBackup },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const title = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? 'Xem tài liệu';

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      {open && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-gray-200 bg-white md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-sm font-bold tracking-wide text-navy-800">HRM Knowledge Search</span>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Đóng menu"><IconClose /></button>
        </div>
        <nav className="space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded px-3 py-2 text-sm ${isActive ? 'bg-navy-50 font-semibold text-navy-800' : 'text-gray-700 hover:bg-gray-100'}`
              }
            >
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
        <p className="absolute bottom-0 p-4 text-xs text-gray-500">Dữ liệu chỉ lưu trên trình duyệt này.</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Mở menu"><IconMenu /></button>
          <h1 className="text-base font-semibold text-gray-800">{title}</h1>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
