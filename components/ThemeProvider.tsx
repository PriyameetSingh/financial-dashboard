"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isThemeName, type ThemeName } from "@/components/nocturne/theme";

/**
 * The authenticated app's light/dark preference.
 *
 * Before the reskin this provider did one thing: strip a `dark` class the app no
 * longer used and clear a stale storage key. The product was light-only, and
 * there was no second palette for it to switch to.
 *
 * Nocturne has two equal themes, so the preference is now real. It is stored per
 * browser rather than per tenant, because it is a property of the person and the
 * screen they are looking at — an officer on a bright site office monitor and one
 * working late want different answers, and neither is the organization's
 * decision to make. The tenant's BRAND travels with the tenant; the ground it is
 * painted on travels with the reader.
 *
 * DEFAULT: dark, matching the net-new surfaces, so the product reads as one
 * design system rather than two. A single line changes it.
 *
 * `mounted` is still exported: server and client must agree on the first paint,
 * so anything that would differ (a clock, a stored preference) waits for it.
 */
const DEFAULT_THEME: ThemeName = "dark";
const STORAGE_KEY = "airawat-theme";

const ThemeContext = createContext<{
  mounted: boolean;
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}>({
  mounted: false,
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // Starts at the default on BOTH sides. Reading storage during render would
  // make the server and the client disagree about the first paint.
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isThemeName(stored)) setThemeState(stored);
      // The pre-reskin key and class, cleared once so an old session does not
      // carry a preference for a palette that no longer exists.
      document.documentElement.classList.remove("dark");
      window.localStorage.removeItem("hudd-theme");
    } catch {
      /* Storage blocked: the default is a perfectly good answer. */
    }
    setMounted(true);
  }, []);

  function setTheme(next: ThemeName) {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The choice still applies for this session. */
    }
  }

  return (
    <ThemeContext.Provider value={{ mounted, theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
