"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getCookie, setCookie } from "@/lib/clientCookie";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// A plain first-party cookie (not localStorage) — the theme is a purely
// cosmetic preference, so it is fine for page JS to read, and the inline
// no-flash script in app/layout.tsx can read it before React hydrates.
const THEME_COOKIE = "d2h-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always starts in light mode. The only way the site becomes dark is a
  // person manually flipping the toggle (remembered in a cookie from then on) — it no
  // longer switches itself based on the device clock. That auto-switch was
  // the site quietly turning dark on visitors in the evening even though
  // they never asked for dark mode, and turning back to light with no way
  // to keep it dark. See components/ThemeToggle.tsx for the switch itself.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = getCookie(THEME_COOKIE);
    const initial: Theme = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      applyTheme(next);
      setCookie(THEME_COOKIE, next);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
