import type { ReactNode } from 'react';
import { EXT_LABEL } from '../utils/constants';
import type { FileExt } from '../types';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded border border-gray-200 bg-white p-4 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'gray' }) {
  const c = tone === 'blue' ? 'bg-navy-50 text-navy-800 border-navy-100' : 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs ${c}`}>{children}</span>;
}

export const ExtBadge = ({ ext }: { ext: FileExt }) => <Badge tone="gray">{EXT_LABEL[ext]}</Badge>;

export function Alert({ kind, children }: { kind: 'error' | 'info' | 'success'; children: ReactNode }) {
  const c = { error: 'border-red-300 bg-red-50 text-red-800', info: 'border-navy-100 bg-navy-50 text-navy-800', success: 'border-green-300 bg-green-50 text-green-800' }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export const btnPrimary = 'rounded bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary = 'rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50';
export const btnDanger = 'rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
export const selectCls = 'rounded border border-gray-300 bg-white px-2 py-2 text-sm focus:border-navy-600 focus:outline-none';
