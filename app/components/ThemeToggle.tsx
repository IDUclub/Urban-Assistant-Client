import { useEffect, useState } from "react";
import { MdDarkMode, MdLightMode, MdContrast } from "react-icons/md";
import {
  DEFAULT_THEME,
  isThemeId,
  THEME_ORDER,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeId,
} from "@/config";
import type { IconType } from "react-icons/lib";

const THEME_ICONS: Record<ThemeId, IconType> = {
  idu: MdLightMode,
  "dgp-light": MdLightMode,
  "dgp-dark": MdDarkMode,
};

function applyTheme(id: ThemeId) {
  const { brand, colorTheme } = THEMES[id];
  document.documentElement.dataset.colorScheme = colorTheme;
  document.documentElement.dataset.brand = brand;
}

function readStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch (error) {
    console.error(error);
    return DEFAULT_THEME;
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const storedThemeId = readStoredTheme();
    setTheme(storedThemeId);
    applyTheme(storedThemeId);
  }, []);

  const handleClickChangeTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
  };

  return (
    <div className="group relative">
      <button
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-ui-border bg-surface-raised/95 text-brand-primary shadow-lg backdrop-blur transition-colors hover:border-brand-primary hover:bg-brand-soft focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        type="button"
        aria-label="Выбор темы"
        aria-haspopup="menu"
      >
        <MdContrast size={21} />
      </button>
      <div className="invisible absolute right-0 top-full z-10 w-max min-w-20 translate-y-1 pt-2 opacity-0 transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div
          role="menu"
          aria-label="Меню пользователя"
          className="rounded-3xl border border-ui-border bg-surface-raised/95 p-3 shadow-[0_24px_40px_-20px_var(--shadow-menu)] backdrop-blur"
        >
          {THEME_ORDER.map((themeId, ind) => {
            const Icon = THEME_ICONS[themeId];
            return (
              <div
                key={`theme-${ind}`}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:border-brand-primary hover:bg-surface-hover focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${themeId === theme ? "bg-brand-active text-content-primary pointer-events-none" : ""}`}
                onClick={() => handleClickChangeTheme(themeId)}
              >
                <span className="shrink-0 text-brand-primary">
                  <Icon />
                </span>
                <button className="min-w-0 max-w-56 truncate text-sm font-medium text-content-primary cursor-pointer">
                  {THEMES[themeId].label}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
