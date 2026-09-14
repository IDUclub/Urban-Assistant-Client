export const BRAND_THEME = "default"

export const THEME_STORAGE_KEY = "urban-assistant-theme";

export const THEMES = {
  "idu": {brand: "default", colorTheme: "light", label: "ИДУ"},
  "dgp-light": {brand: "customer", colorTheme: "light", label: "ДГП"},
  "dgp-dark": {brand: "customer", colorTheme: "dark", label: "ДГП"},
} as const;

export const THEME_ORDER = ["idu", "dgp-light", "dgp-dark"] as const

export type ThemeId = keyof typeof THEMES;

export const DEFAULT_THEME = "idu";

export function isThemeId (value: unknown): value is ThemeId {
  return typeof value === "string" && value in THEMES;
} 
