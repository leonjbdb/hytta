'use client';

import * as React from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hytta-theme';

interface ThemeContextShape {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextShape | undefined>(undefined);

function readSystem(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('light');

  // First-paint: read stored choice if present; otherwise fall back to OS.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme = stored === 'light' || stored === 'dark' ? stored : readSystem();
    setThemeState(initial);
    apply(initial);
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    window.localStorage.setItem(STORAGE_KEY, t);
    apply(t);
  }, []);

  const toggle = React.useCallback(() => {
    setThemeState((curr) => {
      const next: Theme = curr === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(STORAGE_KEY, next);
      apply(next);
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/**
 * Inline script that runs before React hydrates. Prevents a flash of the
 * wrong theme by setting the `dark` class and `color-scheme` based on stored
 * preference (or OS) immediately on first paint.
 */
export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var s=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t==='dark'||(t!=='light'&&s);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
