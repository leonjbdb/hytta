'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from './theme-provider';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const t = useTranslations('Common');
  const label = theme === 'dark' ? t('themeLight') : t('themeDark');
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      <span className="sr-only">{label}</span>
      {theme === 'dark' ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  );
}
