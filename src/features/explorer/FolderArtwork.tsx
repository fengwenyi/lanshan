import { useId } from 'react';

/** Scalable folder artwork shared by file tiles, details and sidebar locations. */
export function FolderArtwork({ size = 22, className = '' }: { size?: number; className?: string }) {
  const id = useId();
  return <svg className={`folder-artwork ${className}`} width={size} height={size} viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-back`} x1="48" y1="9" x2="48" y2="70" gradientUnits="userSpaceOnUse"><stop stopColor="#59C5FA" /><stop offset="1" stopColor="#168BD5" /></linearGradient>
      <linearGradient id={`${id}-front`} x1="48" y1="27" x2="48" y2="73" gradientUnits="userSpaceOnUse"><stop stopColor="#8EDCFF" /><stop offset=".5" stopColor="#57C4FA" /><stop offset="1" stopColor="#36A9ED" /></linearGradient>
      <linearGradient id={`${id}-rim`} x1="48" y1="29" x2="48" y2="72" gradientUnits="userSpaceOnUse"><stop stopColor="#D4F3FF" /><stop offset="1" stopColor="#208FD5" /></linearGradient>
    </defs>
    <path d="M7 19a7 7 0 0 1 7-7h20a10 10 0 0 1 7 3l6 6h35a7 7 0 0 1 7 7v35a7 7 0 0 1-7 7H14a7 7 0 0 1-7-7Z" fill={`url(#${id}-back)`} stroke="#2298DF" strokeWidth="1" />
    <path d="M14 22a3 3 0 0 1 3-3h17a5 5 0 0 1 4 2l5 5H17a3 3 0 0 1-3-3Z" fill="#B5EAFF" opacity=".7" />
    <path d="M17 27h62a4 4 0 0 1 4 4v23H13V31a4 4 0 0 1 4-4Z" fill="#D5F0FF" />
    <path d="M20 25h55a4 4 0 0 1 4 4v19H16V29a4 4 0 0 1 4-4Z" fill="#F3FBFF" />
    <path d="M5 35a6 6 0 0 1 6-6h74a6 6 0 0 1 6 6l-3 31a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7Z" fill={`url(#${id}-front)`} stroke={`url(#${id}-rim)`} strokeWidth="1.2" />
    <path d="M12 31h72" stroke="#E4F7FF" strokeWidth="1.4" strokeLinecap="round" opacity=".85" />
    <path d="M16 70h64" stroke="#137CBC" strokeOpacity=".18" strokeLinecap="round" />
  </svg>;
}
