export const PERSIST_USER_SETTINGS =
  import.meta.env.VITE_PERSIST_USER_SETTINGS === "true";

export function readUserSetting(key: string): unknown {
  if (!PERSIST_USER_SETTINGS || typeof window === "undefined") {
    return;
  }

  try {
    const value = window.localStorage.getItem(key);
    if (value === null) {
      return;
    }
    return JSON.parse(value);
  } catch {
    return;
  }
}

export function writeUserSetting(key: string, value: unknown) {
  if (!PERSIST_USER_SETTINGS || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}
