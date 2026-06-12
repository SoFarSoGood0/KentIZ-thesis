import { useCallback, useEffect, useState } from "react";

export type ThemeName = "dark" | "light";

const STORAGE_KEY = "uc_theme";

export function getStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Sets the `data-theme` attribute that the light-theme CSS keys off. */
export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
}

/** Call once before React renders to avoid a flash of the wrong theme. */
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggle, setTheme: setThemeState };
}
