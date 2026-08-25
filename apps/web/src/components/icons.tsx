type IconProps = { size?: number };

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function IconHome({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  );
}

export function IconShirt({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M9 4 7 7 3 9l2 11h14l2-11-4-2-2-3-2 2.5L9 4z" />
    </svg>
  );
}

export function IconPos({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M7 7h10v13H7z" />
      <path d="M9 4h6l1 3H8l1-3z" />
      <path d="M9 11h6" />
    </svg>
  );
}

export function IconBox({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 8 12 4l8 4v8l-8 4-8-4V8z" />
      <path d="M12 12v8M4 8l8 4 8-4" />
    </svg>
  );
}

export function IconClipboardList({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M9 4h6v2H9z" />
      <path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

export function IconReceipt({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export function IconTruck({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
      <circle cx="7.5" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSwap({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 8h13M13 4l4 4-4 4" />
      <path d="M20 16H7M11 12l-4 4 4 4" />
    </svg>
  );
}

export function IconAlertTriangle({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M12 4 3 20h18L12 4z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconWallet({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M16 12h3v3h-3a1.5 1.5 0 0 1 0-3z" />
    </svg>
  );
}

export function IconChart({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconUsers({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.2" />
      <path d="M15 14.3c2.5.4 4.5 2.6 4.5 5.7" />
    </svg>
  );
}

export function IconBell({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconMore({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevronDown({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconLogout({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M10 6H6v12h4M14 16l4-4-4-4M9 12h9" />
    </svg>
  );
}

export function IconStore({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 9.5 5 4h14l1 5.5" />
      <path d="M4 9.5a2.3 2.3 0 0 0 4.4 1 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4-1" />
      <path d="M6 11v9h12v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function IconClose({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCamera({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  );
}

export function IconHelp({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        fill="#fff"
        d="M12.05 6.15c-1.92 0-3.28 1.22-3.28 3.02h1.78c0-.88.58-1.42 1.42-1.42.82 0 1.38.5 1.38 1.28 0 .72-.4 1.12-1.12 1.62-1.02.7-1.68 1.42-1.68 2.58v.32h1.82v-.22c0-.72.32-1.18 1.22-1.82 1.02-.72 1.82-1.52 1.82-2.78 0-1.92-1.48-3.58-3.36-3.58z"
      />
      <circle cx="12.05" cy="17.15" r="1.15" fill="#fff" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

export function IconPencil({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconTrash({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7 7.5 20h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
