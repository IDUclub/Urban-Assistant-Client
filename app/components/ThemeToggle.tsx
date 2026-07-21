import { useEffect, useState } from "react";
import { MdDarkMode, MdLightMode } from "react-icons/md";

type ColorScheme = "light" | "dark";

const STORAGE_KEY = "urban-assistant-color-scheme";

function applyColorScheme(colorScheme: ColorScheme) {
  document.documentElement.dataset.colorScheme = colorScheme;
}

export default function ThemeToggle() {
  const [colorScheme, setColorScheme] = useState<ColorScheme>("light");

  useEffect(() => {
    let savedColorScheme: ColorScheme = "light";

    try {
      const savedValue = localStorage.getItem(STORAGE_KEY);
      if (savedValue === "light" || savedValue === "dark") {
        savedColorScheme = savedValue;
      }
    } catch {
    }

    setColorScheme(savedColorScheme);
    applyColorScheme(savedColorScheme);
  }, []);

  const toggleColorScheme = () => {
    const nextColorScheme: ColorScheme = colorScheme === "light" ? "dark" : "light";

    setColorScheme(nextColorScheme);
    applyColorScheme(nextColorScheme);

    try {
      localStorage.setItem(STORAGE_KEY, nextColorScheme);
    } catch {
    }
  };

  const isDark = colorScheme === "dark";

  return (
    <button
      type="button"
      className="fixed right-4 top-4 z-50 flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-ui-border bg-surface-raised/95 text-content-primary shadow-lg backdrop-blur transition-colors hover:border-brand-primary hover:text-brand-primary"
      onClick={toggleColorScheme}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
    >
      {isDark ? <MdLightMode size={22} /> : <MdDarkMode size={22} />}
    </button>
  );
}
