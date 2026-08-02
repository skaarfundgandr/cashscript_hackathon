import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function SearchIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>;
}

export function FilterIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" /><circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none" /></svg>;
}

export function StarIcon({ filled, ...props }: IconProps & { filled: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" {...props}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2l-5-4.9 6.9-1z" /></svg>;
}

export function ShieldIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 2.5 7.5 3v6c0 4.6-3.1 8.6-7.5 10-4.4-1.4-7.5-5.4-7.5-10v-6z" /><path d="m9 12 2.2 2.2 4.3-4.2" /></svg>;
}

/** Draws itself in via pathLength when animated — the checkout confirmation. */
export function CheckIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m4.5 12.5 5 5 10-11" /></svg>;
}

export function HeartIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20.3 5.6a5 5 0 0 0-7.1 0L12 6.8l-1.2-1.2a5 5 0 0 0-7.1 7.1l8.3 8.3 8.3-8.3a5 5 0 0 0 0-7.1z" /></svg>;
}
