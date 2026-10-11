/** Light / dark / system theme. Persisted per device (a viewer preference, not
 *  account data) and applied as <html data-theme>, which pins `color-scheme`. */
export type Theme = "system" | "light" | "dark";

const KEY = "theme";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme = getTheme()): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f1729" : "#f6f8fb");
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked: still applies for this page view */
  }
  applyTheme(theme);
}
