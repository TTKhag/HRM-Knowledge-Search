import type { ReactNode } from 'react';

function Svg({ children, className = 'h-5 w-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
type P = { className?: string };
export const IconHome = (p: P) => <Svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></Svg>;
export const IconLibrary = (p: P) => <Svg {...p}><path d="M4 4h4v16H4z" /><path d="M10 4h4v16h-4z" /><path d="M16 6l4 1-3 13-4-1z" /></Svg>;
export const IconBackup = (p: P) => <Svg {...p}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></Svg>;
