import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

/** Compact light/dark switch. Styled by `.uc-theme-toggle` in theme-light.css. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={`uc-theme-toggle ${className}`}
      onClick={toggle}
      aria-label={isDark ? "Aydınlık temaya geç" : "Karanlık temaya geç"}
      title={isDark ? "Aydınlık tema" : "Karanlık tema"}
    >
      {isDark ? <Sun /> : <Moon />}
    </button>
  );
}
