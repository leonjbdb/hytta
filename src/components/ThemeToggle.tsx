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
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={toggle}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
