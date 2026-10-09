"use client";

import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";

const themeOrder: ThemeMode[] = ["system", "light", "dark"];

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = theme;

  const resolved =
    theme === "dark"
      ? "dark"
      : theme === "light"
        ? "light"
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

  root.dataset.colorScheme = resolved;
  root.style.colorScheme = resolved;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }

    const stored = window.localStorage.getItem("theme");
    return stored === "system" || stored === "light" || stored === "dark"
      ? stored
      : "system";
  });

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") {
      return;
    }

    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => applyTheme("system");
    systemTheme.addEventListener("change", syncSystemTheme);

    return () => systemTheme.removeEventListener("change", syncSystemTheme);
  }, [theme]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-panel p-1 text-xs text-foreground shadow-sm">
      {themeOrder.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-label={`Set theme to ${choice}`}
          aria-pressed={theme === choice}
          onClick={() => handleThemeChange(choice)}
          className={[
            "rounded-full px-2.5 py-1.5 font-medium transition-colors",
            theme === choice
              ? "bg-background text-foreground shadow-sm"
              : "text-foreground/70 hover:text-foreground",
          ].join(" ")}
        >
          {choice === "system" ? "System" : choice === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
