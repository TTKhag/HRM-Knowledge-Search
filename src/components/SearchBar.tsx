import { useState, type FormEvent } from 'react';
import { IconSearch } from './Icons';

interface Props { initial?: string; large?: boolean; onSubmit: (q: string) => void; placeholder?: string }

export default function SearchBar({ initial = '', large, onSubmit, placeholder = 'Nhập từ khóa cần tra cứu trong tài liệu…' }: Props) {
  const [value, setValue] = useState(initial);
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(value.trim()); };
  return (
    <form onSubmit={submit} className="flex w-full gap-2" role="search">
      <div className="relative flex-1">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded border border-gray-300 bg-white pl-10 pr-3 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 ${large ? 'py-3 text-base' : 'py-2 text-sm'}`}
        />
      </div>
      <button type="submit" className={`rounded bg-navy-700 px-5 font-medium text-white hover:bg-navy-800 ${large ? 'text-base' : 'text-sm'}`}>
        Tìm kiếm
      </button>
    </form>
  );
}
