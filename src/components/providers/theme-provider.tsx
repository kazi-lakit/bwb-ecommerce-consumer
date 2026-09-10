"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Reads from the same source as the inline script in app/layout.tsx, so this lazy
// initializer and the pre-paint DOM state always agree (no hydration mismatch).
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Private browsing / storage disabled — fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // The inline script sets data-theme before first paint to avoid a flash, but in dev,
  // React Strict Mode's remount resets <html> to only the attributes JSX manages,
  // wiping it. Re-applying on every theme change fixes dev and is a harmless no-op in
  // production, where the DOM already matches.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing / storage disabled — theme just won't persist across reloads.
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
