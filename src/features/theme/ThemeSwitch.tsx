import { useLayoutEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Segmented } from '../../ui/Segmented';
import type { SegmentedOption } from '../../ui/Segmented';

type ThemeChoice = 'system' | 'light' | 'dark';

const THEME_OPTIONS: readonly SegmentedOption<ThemeChoice>[] = [
  {value: 'system', label: '跟随系统', icon: <Monitor size={14}/>},
  {value: 'light', label: '浅色', icon: <Sun size={14}/>},
  {value: 'dark', label: '深色', icon: <Moon size={14}/>},
];

// `system` removes the attribute so the prefers-color-scheme block in tokens.css
// decides, live, with no matchMedia listener.
function applyThemeChoice(root: HTMLElement, choice: ThemeChoice) {
  switch (choice) {
    case 'system':
      root.removeAttribute('data-theme');
      return;
    case 'light':
    case 'dark':
      root.setAttribute('data-theme', choice);
      return;
    default: {
      const unhandled: never = choice;
      throw new Error(`unknown theme ${String(unhandled)}`);
    }
  }
}

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useLayoutEffect(() => {
    applyThemeChoice(document.documentElement, choice);
    return () => applyThemeChoice(document.documentElement, 'system');
  }, [choice]);
  return <Segmented className="theme-switch" label="外观" value={choice} options={THEME_OPTIONS} onChange={setChoice}/>;
}