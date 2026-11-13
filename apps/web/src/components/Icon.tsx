/** Set de íconos dibujados, un solo grosor de trazo. */
import type { JSX } from "react";

const paths: Record<string, JSX.Element> = {
  feed: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></>,
  hash: <><path d="M9 4 7 20" /><path d="M17 4l-2 16" /><path d="M4 9h16" /><path d="M3 15h16" /></>,
  chat: <><path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7Z" /></>,
  collections: <><path d="M12 3l8 4.5-8 4.5-8-4.5L12 3Z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5 12 21l8-4.5" /></>,
  library: <><path d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" /><path d="M17 20a2 2 0 0 0 2-2V6" /><path d="M9 8h5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  spark: <><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m6 6 2.5 2.5" /><path d="m15.5 15.5 2.5 2.5" /><path d="m18 6-2.5 2.5" /><path d="m8.5 15.5-2.5 2.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  logout: <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  book: <path d="M6 4h9a3 3 0 0 1 3 3v13H9a3 3 0 0 1-3-3V4Z" />,
  repo: <><path d="M6 3h11a1 1 0 0 1 1 1v16l-4-2-4 2V4a1 1 0 0 0-1-1H6Z" /></>,
  snippet: <><path d="m8 8-4 4 4 4" /><path d="m16 8 4 4-4 4" /><path d="m13 5-2 14" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  check: <path d="m5 12 5 5L20 7" />,
  back: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>,
  sync: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16" /><path d="M4 20v-4h4" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  folder: <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />,
  file: <><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" /><path d="M14 3v4h4" /></>,
  upload: <><path d="M12 19V7" /><path d="m7 12 5-5 5 5" /><path d="M5 21h14" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" /></>,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 16.2v.3" /></>,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
