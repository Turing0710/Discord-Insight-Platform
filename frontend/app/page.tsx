"use client";

import { useEffect, useState } from "react";

import InsightWorkbench from "../components/InsightWorkbench";
import { Locale, t } from "../lib/i18n";

type ThemeMode = "light" | "dark";

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("discord_insight_theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("discord_insight_theme", theme);
  }, [theme]);

  return (
    <main className="min-h-screen px-6 py-10 md:px-10">
      <div className="mx-auto mb-6 flex max-w-6xl justify-end gap-2">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-300/80 bg-white/90 px-1.5 py-1 text-xs shadow-sm backdrop-blur">
          <span className="px-1.5 text-slate-500">{t(locale, "lang.switchLabel")}</span>
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={`rounded-xl px-2.5 py-1 transition ${
              locale === "en" ? "bg-ink text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t(locale, "lang.english")}
          </button>
          <button
            type="button"
            onClick={() => setLocale("zh-CN")}
            className={`rounded-xl px-2.5 py-1 transition ${
              locale === "zh-CN" ? "bg-ink text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t(locale, "lang.chineseSimplified")}
          </button>
        </div>

        <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-300/80 bg-white/90 px-1.5 py-1 text-xs shadow-sm backdrop-blur">
          <span className="px-1.5 text-slate-500">{t(locale, "theme.switchLabel")}</span>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`rounded-xl px-2.5 py-1 transition ${
              theme === "light" ? "bg-ink text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t(locale, "theme.light")}
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`rounded-xl px-2.5 py-1 transition ${
              theme === "dark" ? "bg-ink text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t(locale, "theme.dark")}
          </button>
        </div>
      </div>

      <section className="mx-auto mb-8 max-w-6xl rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300/80 bg-white text-[#5865F2] shadow-sm">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
              <path d="M20.32 4.37A19.79 19.79 0 0 0 15.4 2.8c-.21.38-.45.89-.62 1.29a18.42 18.42 0 0 0-5.56 0c-.17-.4-.42-.91-.63-1.29a19.74 19.74 0 0 0-4.93 1.57C.53 9.02-.31 13.55.11 18.02a19.92 19.92 0 0 0 6.03 3.06c.49-.66.93-1.37 1.31-2.11-.72-.27-1.41-.6-2.06-.98.17-.13.33-.27.49-.41 3.97 1.86 8.28 1.86 12.2 0 .16.14.33.28.49.41-.65.38-1.34.71-2.06.98.38.74.82 1.45 1.31 2.11a19.85 19.85 0 0 0 6.04-3.06c.49-5.19-.84-9.68-3.54-13.65ZM8.35 15.29c-1.19 0-2.17-1.08-2.17-2.41 0-1.33.96-2.41 2.17-2.41 1.22 0 2.19 1.09 2.17 2.41 0 1.33-.96 2.41-2.17 2.41Zm7.3 0c-1.19 0-2.17-1.08-2.17-2.41 0-1.33.96-2.41 2.17-2.41 1.22 0 2.19 1.09 2.17 2.41 0 1.33-.95 2.41-2.17 2.41Z" />
            </svg>
          </span>
          {t(locale, "page.title")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">{t(locale, "page.subtitle")}</p>
      </section>

      <InsightWorkbench locale={locale} />
    </main>
  );
}
