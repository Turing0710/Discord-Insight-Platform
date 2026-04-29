"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  DiscordChannel,
  DiscordGuild,
  ScrapeResult,
  fetchDiscordChannels,
  fetchDiscordGuilds,
  triggerScrape
} from "../lib/api";
import { Locale, t } from "../lib/i18n";

type RequestStatus = "idle" | "loading" | "success" | "error";
type ScrapeFormProps = {
  locale: Locale;
  onSuccess?: (result: ScrapeResult) => void;
};

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const CATEGORY_CHANNEL_TYPE = 4;
const EXPORTABLE_CHANNEL_TYPES = new Set([0, 2, 5, 10, 11, 12, 13, 15, 16]);

type ChannelGroup = {
  id: string;
  name: string;
  position: number;
  channels: DiscordChannel[];
};

function getInitialIcon(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function getChannelPrefix(channel: DiscordChannel): string {
  if (channel.type === 2 || channel.type === 13) return "VC";
  if (channel.type === 15 || channel.type === 16) return "FOR";
  return "#";
}

function getCategoryIds(items: DiscordChannel[]): string[] {
  return items
    .filter((item) => item.type === CATEGORY_CHANNEL_TYPE)
    .map((item) => item.id);
}

export default function ScrapeForm({ locale, onSuccess }: ScrapeFormProps) {
  const [discordToken, setDiscordToken] = useState("");
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [guildSearch, setGuildSearch] = useState("");
  const [guildId, setGuildId] = useState("");
  const [isGuildPickerOpen, setIsGuildPickerOpen] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [isChannelPickerOpen, setIsChannelPickerOpen] = useState(false);
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<string[]>([]);
  const [manualSubOptionId, setManualSubOptionId] = useState("");
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [browserError, setBrowserError] = useState("");

  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [isTokenGuideOpen, setIsTokenGuideOpen] = useState(false);
  const [tokenGuideCopyStatus, setTokenGuideCopyStatus] = useState("");
  const [isGuideImageOpen, setIsGuideImageOpen] = useState(false);

  const guildRequestRef = useRef(0);
  const channelRequestRef = useRef(0);
  const tokenGuidePanelRef = useRef<HTMLDivElement | null>(null);
  const guildPickerRef = useRef<HTMLDivElement | null>(null);
  const channelPickerRef = useRef<HTMLDivElement | null>(null);
  const trimmedToken = discordToken.trim();
  const normalizedGuildSearch = guildSearch.trim().toLowerCase();
  const tokenGuideText = t(locale, "scrape.tooltip.tokenGuide");

  const selectedChannelSet = useMemo(() => new Set(selectedChannelIds), [selectedChannelIds]);
  const selectedGuild = useMemo(
    () => guilds.find((item) => item.id === guildId) ?? null,
    [guildId, guilds]
  );
  const exportableChannels = useMemo(
    () =>
      channels.filter(
        (item) => item.type !== CATEGORY_CHANNEL_TYPE && (item.type === null || EXPORTABLE_CHANNEL_TYPES.has(item.type))
      ),
    [channels]
  );

  const effectiveChannels = useMemo(() => {
    if (selectedChannelIds.length === 0) return exportableChannels;
    return exportableChannels.filter((item) => selectedChannelSet.has(item.id));
  }, [exportableChannels, selectedChannelIds, selectedChannelSet]);

  const statusText = useMemo(() => {
    if (status === "loading") return t(locale, "scrape.status.loading");
    if (status === "success") return t(locale, "scrape.status.success");
    if (status === "error") return t(locale, "scrape.status.failed", { message: errorMessage });
    return t(locale, "scrape.status.ready");
  }, [status, errorMessage, locale]);

  const statusClass =
    status === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : status === "error"
        ? "border-rose-300 bg-rose-50 text-rose-700"
        : status === "loading"
          ? "border-sky-300 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-white text-slate-600";

  const browserStatus = useMemo(() => {
    if (!trimmedToken) return "";
    if (trimmedToken.length < 20) return t(locale, "scrape.status.enterFullToken");
    if (isLoadingGuilds) return t(locale, "scrape.status.loadingServers");
    if (isLoadingChannels) return t(locale, "scrape.status.loadingChannels");
    if (browserError) return browserError;
    if (guilds.length === 0) return t(locale, "scrape.status.noServers");
    if (guildId && exportableChannels.length === 0) return t(locale, "scrape.status.noChannels");
    if (!guildId) return t(locale, "scrape.status.selectServer");
    return t(locale, "scrape.status.readyChannelSelection");
  }, [
    browserError,
    exportableChannels.length,
    guildId,
    guilds.length,
    isLoadingChannels,
    isLoadingGuilds,
    locale,
    trimmedToken
  ]);

  const filteredGuilds = useMemo(
    () =>
      guilds.filter((item) => {
        if (!normalizedGuildSearch) return true;
        return (
          item.name.toLowerCase().includes(normalizedGuildSearch) ||
          item.id.toLowerCase().includes(normalizedGuildSearch)
        );
      }),
    [guilds, normalizedGuildSearch]
  );

  const channelGroups = useMemo<ChannelGroup[]>(() => {
    const categories = channels
      .filter((item) => item.type === CATEGORY_CHANNEL_TYPE)
      .map((item) => ({
        id: item.id,
        name: item.name,
        position: item.position ?? 999999,
        channels: [] as DiscordChannel[]
      }));
    const categoryMap = new Map(categories.map((item) => [item.id, item]));
    const uncategorized: ChannelGroup = {
      id: "__uncategorized",
      name: t(locale, "scrape.channel.uncategorized"),
      position: -1,
      channels: []
    };

    for (const channel of exportableChannels) {
      const group = channel.parent_id ? categoryMap.get(channel.parent_id) : null;
      if (group) {
        group.channels.push(channel);
      } else {
        uncategorized.channels.push(channel);
      }
    }

    const groups = [uncategorized, ...categories]
      .filter((item) => item.channels.length > 0)
      .sort((a, b) => a.position - b.position);

    return groups.map((group) => ({
      ...group,
      channels: [...group.channels].sort(
        (a, b) => (a.position ?? 999999) - (b.position ?? 999999)
      )
    }));
  }, [channels, exportableChannels, locale]);

  const channelButtonText = useMemo(() => {
    if (exportableChannels.length === 0) return t(locale, "scrape.option.noChannel");
    if (selectedChannelIds.length === 0) return t(locale, "scrape.channel.button.none");
    if (selectedChannelIds.length === exportableChannels.length) return t(locale, "scrape.channel.button.all");
    return t(locale, "scrape.channel.button.count", { count: selectedChannelIds.length });
  }, [exportableChannels.length, locale, selectedChannelIds.length]);

  useEffect(() => {
    setGuilds([]);
    setChannels([]);
    setGuildSearch("");
    setGuildId("");
    setIsGuildPickerOpen(false);
    setSelectedChannelIds([]);
    setManualSubOptionId("");
    setBrowserError("");
    setIsChannelPickerOpen(false);

    if (!trimmedToken) {
      setIsLoadingGuilds(false);
      return;
    }
    if (trimmedToken.length < 20) {
      setIsLoadingGuilds(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void loadGuilds(trimmedToken);
    }, 550);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trimmedToken]);

  useEffect(() => {
    setChannels([]);
    setSelectedChannelIds([]);
    setManualSubOptionId("");
    setIsChannelPickerOpen(false);
    setCollapsedCategoryIds([]);

    if (!trimmedToken || !guildId) {
      setIsLoadingChannels(false);
      return;
    }

    void loadChannels(trimmedToken, guildId);
  }, [trimmedToken, guildId]);

  useEffect(() => {
    setSelectedChannelIds((prev) => prev.filter((id) => exportableChannels.some((item) => item.id === id)));
  }, [exportableChannels]);

  useEffect(() => {
    if (!isTokenGuideOpen && !isGuildPickerOpen && !isChannelPickerOpen) return;

    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (isTokenGuideOpen && !tokenGuidePanelRef.current?.contains(target)) {
        setIsTokenGuideOpen(false);
      }
      if (isGuildPickerOpen && !guildPickerRef.current?.contains(target)) {
        setIsGuildPickerOpen(false);
      }
      if (isChannelPickerOpen && !channelPickerRef.current?.contains(target)) {
        setIsChannelPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [isChannelPickerOpen, isGuildPickerOpen, isTokenGuideOpen]);

  async function loadGuilds(token: string) {
    const requestId = guildRequestRef.current + 1;
    guildRequestRef.current = requestId;
    setIsLoadingGuilds(true);
    setBrowserError("");

    try {
      const items = await fetchDiscordGuilds(token);
      if (requestId !== guildRequestRef.current) return;

      setGuilds(items);
      if (items.length === 0) {
        setGuildId("");
        setBrowserError(t(locale, "scrape.status.noServers"));
      } else {
        setGuildId(items[0].id);
      }
    } catch (error) {
      if (requestId !== guildRequestRef.current) return;
      setGuilds([]);
      setGuildId("");
      setBrowserError(error instanceof Error ? error.message : t(locale, "common.unknownError"));
    } finally {
      if (requestId === guildRequestRef.current) {
        setIsLoadingGuilds(false);
      }
    }
  }

  async function loadChannels(token: string, selectedGuildId: string) {
    const requestId = channelRequestRef.current + 1;
    channelRequestRef.current = requestId;
    setIsLoadingChannels(true);
    setBrowserError("");

    try {
      const items = await fetchDiscordChannels(token, selectedGuildId);
      if (requestId !== channelRequestRef.current) return;
      setChannels(items);
      setSelectedChannelIds([]);
      setCollapsedCategoryIds(getCategoryIds(items));
    } catch (error) {
      if (requestId !== channelRequestRef.current) return;
      setChannels([]);
      setSelectedChannelIds([]);
      setBrowserError(error instanceof Error ? error.message : t(locale, "common.unknownError"));
    } finally {
      if (requestId === channelRequestRef.current) {
        setIsLoadingChannels(false);
      }
    }
  }

  function toggleChannelSelection(channelId: string) {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  }

  function selectGuild(nextGuildId: string) {
    setGuildId(nextGuildId);
    setGuildSearch("");
    setIsGuildPickerOpen(false);
  }

  function toggleCategory(groupId: string) {
    setCollapsedCategoryIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedToken) {
      setStatus("error");
      setErrorMessage(t(locale, "scrape.error.tokenRequired"));
      return;
    }

    const normalizedManualSubOptionId = manualSubOptionId.trim();
    if (normalizedManualSubOptionId && !/^\d+$/.test(normalizedManualSubOptionId)) {
      setStatus("error");
      setErrorMessage(t(locale, "scrape.error.subOptionIdInvalid"));
      return;
    }

    if (!normalizedManualSubOptionId && effectiveChannels.length === 0) {
      setStatus("error");
      setErrorMessage(t(locale, "scrape.error.channelRequired"));
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    setResult(null);

    try {
      if (normalizedManualSubOptionId) {
        const data = await triggerScrape({
          discord_token: trimmedToken,
          channel_id: normalizedManualSubOptionId,
          start_date: startDate,
          end_date: endDate
        });
        setResult(data);
        setStatus("success");
        onSuccess?.(data);
        return;
      }

      let lastResult: ScrapeResult | null = null;
      for (const channel of effectiveChannels) {
        const data = await triggerScrape({
          discord_token: trimmedToken,
          channel_id: channel.id,
          channel_name: channel.name,
          start_date: startDate,
          end_date: endDate
        });
        lastResult = data;
      }

      if (lastResult) {
        setResult(lastResult);
        onSuccess?.(lastResult);
      }
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : t(locale, "common.unknownError"));
    }
  }

  async function copyTokenGuideText() {
    try {
      await navigator.clipboard.writeText(tokenGuideText);
      setTokenGuideCopyStatus(t(locale, "scrape.tooltip.tokenGuideCopied"));
    } catch {
      setTokenGuideCopyStatus(t(locale, "scrape.tooltip.tokenGuideCopyFailed"));
    }
  }

  return (
    <div className="relative w-full">
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2">
                <span>{t(locale, "scrape.label.discordToken")}</span>
                <span className="relative inline-flex" ref={tokenGuidePanelRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTokenGuideOpen((prev) => !prev);
                      setTokenGuideCopyStatus("");
                    }}
                    aria-label={t(locale, "scrape.tooltip.tokenGuideIconLabel")}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path d="M2 6.75A2.75 2.75 0 0 1 4.75 4h6.5A2.75 2.75 0 0 1 14 6.75V20H4.75A2.75 2.75 0 0 0 2 22V6.75Z" />
                      <path d="M22 6.75A2.75 2.75 0 0 0 19.25 4h-6.5A2.75 2.75 0 0 0 10 6.75V20h9.25A2.75 2.75 0 0 1 22 22V6.75Z" />
                    </svg>
                  </button>

                  {isTokenGuideOpen ? (
                    <div className="absolute left-1/2 top-7 z-20 w-[22rem] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-700">
                        {t(locale, "scrape.tooltip.tokenGuideTitle")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsTokenGuideOpen(false)}
                        className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 transition hover:bg-slate-50"
                      >
                        {t(locale, "scrape.tooltip.tokenGuideClose")}
                      </button>
                    </div>

                    <textarea
                      readOnly
                      value={tokenGuideText}
                      className="h-36 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-5 text-slate-700"
                    />

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyTokenGuideText()}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {t(locale, "scrape.tooltip.tokenGuideCopy")}
                      </button>
                      {tokenGuideCopyStatus ? (
                        <span className="text-[11px] text-slate-500">{tokenGuideCopyStatus}</span>
                      ) : null}
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <button
                        type="button"
                        onClick={() => setIsGuideImageOpen(true)}
                        className="w-full overflow-hidden rounded-md border border-slate-200 bg-white"
                      >
                        <img
                          src="/images/dc-token-guide.jpg"
                          alt={t(locale, "scrape.tooltip.tokenGuideImageAlt")}
                          className="h-28 w-full object-cover object-top"
                        />
                      </button>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {t(locale, "scrape.tooltip.tokenGuideImageHint")}
                      </p>
                    </div>
                    </div>
                  ) : null}
                </span>
              </span>
              <span className="group relative inline-flex shrink-0">
                <button
                  type="button"
                  aria-label={t(locale, "scrape.tooltip.iconLabel")}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-xs font-bold text-amber-700 shadow-sm"
                >
                  !
                </button>
                <span className="pointer-events-none absolute right-0 top-8 z-30 w-72 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-normal leading-5 text-amber-800 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
                  {t(locale, "scrape.tooltip.tokenRisk")}
                </span>
              </span>
            </span>
            <input
              type="password"
              value={discordToken}
              onChange={(e) => setDiscordToken(e.target.value)}
              placeholder={t(locale, "scrape.placeholder.discordToken")}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">{t(locale, "scrape.label.server")}</span>
            <input
              value={guildSearch}
              onChange={(e) => setGuildSearch(e.target.value)}
              onFocus={() => setIsGuildPickerOpen(true)}
              placeholder={t(locale, "scrape.placeholder.serverSearch")}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-500"
              disabled={!trimmedToken || isLoadingGuilds || guilds.length === 0}
            />
            <div className="relative" ref={guildPickerRef}>
              <button
                type="button"
                onClick={() => setIsGuildPickerOpen((prev) => !prev)}
                disabled={!trimmedToken || isLoadingGuilds || guilds.length === 0}
                className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition hover:bg-slate-50 focus:border-brand focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {selectedGuild?.icon_url ? (
                    <img
                      src={selectedGuild.icon_url}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                      {selectedGuild ? getInitialIcon(selectedGuild.name) : "?"}
                    </span>
                  )}
                  <span
                    className="truncate"
                    style={{ fontFamily: "'gg sans', 'Noto Color Emoji', system-ui, sans-serif" }}
                  >
                    {selectedGuild?.name ?? t(locale, "scrape.option.noServer")}
                  </span>
                </span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 shrink-0 transition-transform ${isGuildPickerOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {isGuildPickerOpen ? (
                <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  {guilds.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-500">{t(locale, "scrape.option.noServer")}</p>
                  ) : filteredGuilds.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-500">{t(locale, "scrape.option.noMatchedServer")}</p>
                  ) : (
                    filteredGuilds.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectGuild(item.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                          item.id === guildId ? "bg-sky-50 text-sky-900" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {item.icon_url ? (
                          <img src={item.icon_url} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                            {getInitialIcon(item.name)}
                          </span>
                        )}
                        <span
                          className="min-w-0 truncate"
                          style={{ fontFamily: "'gg sans', 'Noto Color Emoji', system-ui, sans-serif" }}
                        >
                          {item.name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">{t(locale, "scrape.label.channel")}</span>
            <div className="relative" ref={channelPickerRef}>
              <button
                type="button"
                onClick={() => setIsChannelPickerOpen((prev) => !prev)}
                disabled={!guildId || isLoadingChannels || exportableChannels.length === 0}
                className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition hover:bg-slate-50 focus:border-brand focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <span className="truncate">{channelButtonText}</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 shrink-0 transition-transform ${isChannelPickerOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {isChannelPickerOpen ? (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedChannelIds(exportableChannels.map((item) => item.id))}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
                    >
                      {t(locale, "scrape.channel.selectAll")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedChannelIds([])}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
                    >
                      {t(locale, "scrape.channel.clearAll")}
                    </button>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                    {channelGroups.map((group) => {
                      const collapsed = collapsedCategoryIds.includes(group.id);
                      return (
                        <div key={group.id} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => toggleCategory(group.id)}
                            className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span
                              className="truncate"
                              style={{ fontFamily: "'gg sans', 'Noto Color Emoji', system-ui, sans-serif" }}
                            >
                              {group.name}
                            </span>
                          </button>
                          {collapsed
                            ? null
                            : group.channels.map((item) => (
                                <label
                                  key={item.id}
                                  className="ml-4 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedChannelSet.has(item.id)}
                                    onChange={() => toggleChannelSelection(item.id)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="w-8 shrink-0 text-center text-[10px] font-semibold text-slate-400">
                                    {getChannelPrefix(item)}
                                  </span>
                                  <span
                                    className="min-w-0 truncate text-sm text-slate-700"
                                    style={{ fontFamily: "'gg sans', 'Noto Color Emoji', system-ui, sans-serif" }}
                                  >
                                    {item.name}
                                  </span>
                                </label>
                              ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            {exportableChannels.length > 0 && selectedChannelIds.length === 0 ? (
              <p className="text-xs text-slate-400">{t(locale, "scrape.channel.warning.defaultAll")}</p>
            ) : (
              <p className="text-xs text-slate-500">{t(locale, "scrape.channel.panelHint")}</p>
            )}
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-medium text-slate-600">
              {t(locale, "scrape.label.subOptionIdManual")}
            </span>
            <input
              value={manualSubOptionId}
              onChange={(e) => setManualSubOptionId(e.target.value)}
              placeholder={t(locale, "scrape.placeholder.subOptionIdManual")}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
              inputMode="numeric"
            />
            <p className="text-xs text-slate-500">{t(locale, "scrape.helper.subOptionIdManual")}</p>
          </label>
        </div>

        {browserStatus ? (
          <div
            className={`rounded-xl border px-4 py-3 text-xs ${
              browserError
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {browserStatus}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">
              {t(locale, "scrape.label.startDate")}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">
              {t(locale, "scrape.label.endDate")}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
              required
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={
                status === "loading" ||
                isLoadingGuilds ||
                isLoadingChannels
              }
              className="primary-action-button w-full justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              <span>
                {status === "loading"
                  ? t(locale, "scrape.button.running")
                  : t(locale, "scrape.button.start")}
              </span>
            </button>
          </div>
        </div>
      </form>

      <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${statusClass}`}>{statusText}</div>

      {result ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-medium">{t(locale, "scrape.result.channel")}</span> {result.channel_id}
          </p>
          <p>
            <span className="font-medium">{t(locale, "scrape.result.outputFile")}</span> {result.output_file}
          </p>
          <p className="break-all">
            <span className="font-medium">{t(locale, "scrape.result.outputPath")}</span> {result.output_path}
          </p>
        </div>
      ) : null}

      {isGuideImageOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4"
          onClick={() => setIsGuideImageOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsGuideImageOpen(false)}
              className="absolute right-3 top-3 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {t(locale, "scrape.tooltip.tokenGuideClose")}
            </button>
            <img
              src="/images/dc-token-guide.jpg"
              alt={t(locale, "scrape.tooltip.tokenGuideImageAlt")}
              className="max-h-[80vh] w-full rounded-md object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
