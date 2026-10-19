import { useEffect, useState } from 'react';

/** Same edge as Tailwind's `lg:` and the desktop rules in globals.css. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

const matches = () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;

/** Laptop / desktop width: docked sidebar, centered dialogs, table lists.
    Below it the app keeps the touch layout (hamburger menu, bottom sheets).
    Follows window resizes and rotation live. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}
