'use client';

import { LangSwitcher } from './LangSwitcher';
import { ThemeToggle } from './ThemeToggle';

export function PublicPreferences() {
  return (
    <div className="flex items-center justify-end gap-2">
      <LangSwitcher />
      <ThemeToggle />
    </div>
  );
}
