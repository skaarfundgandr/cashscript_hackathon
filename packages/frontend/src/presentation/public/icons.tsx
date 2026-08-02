// Local copies so presentation/public/ never imports from presentation/marketplace/. Same 16px
// stroke geometry as skin-a-icons.tsx.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function SearchIcon(props: { 'aria-hidden'?: boolean }) {
  return <svg {...base} {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}

export function ShieldIcon(props: { 'aria-hidden'?: boolean }) {
  return <svg {...base} {...props}><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export function ChevronIcon({ open }: { open: boolean }) {
  return <svg {...base} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="m9 6 6 6-6 6" /></svg>;
}

export function ExternalIcon() {
  return <svg {...base}><path d="M14 5h5v5" /><path d="M19 5 10 14" /><path d="M18 14v5H5V6h5" /></svg>;
}
