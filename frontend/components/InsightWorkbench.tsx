"use client";

import { useEffect, useMemo, useState } from "react";

import ScrapeForm from "./ScrapeForm";
import {
  AnalyzeScenario,
  ChatDataResponse,
  ExportFileSummary,
  ScrapeResult,
  deleteExportFiles,
  fetchExportFiles,
  fetchMessages,
  renameExportFile
} from "../lib/api";
import { Locale, t } from "../lib/i18n";

const QUICK_KEYWORDS = ["bug", "lag", "event", "Roblox", "crash", "login", "disconnect"];
const MAX_TABLE_ROWS = 1000;
const MAX_PROMPT_MESSAGES = 300;
const CHATGPT_URL = "https://chatgpt.com/";

type InsightWorkbenchProps = {
  locale: Locale;
};

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "-";
  if (seconds < 1) return "<1s";

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildChatGptPrompt(input: {
  locale: Locale;
  scenario: { title: string; description: string };
  fileName: string;
  guildName: string | null;
  channelName: string | null;
  keyword: string;
  authorFilter: string;
  messages: Array<{ timestamp: string; author: string; content: string }>;
}): string {
  const trimmedKeyword = input.keyword.trim();
  const totalCount = input.messages.length;
  const selectedMessages = input.messages.slice(0, MAX_PROMPT_MESSAGES);
  const filteredMeta = [
    `Scenario: ${input.scenario.title}`,
    `Scenario Description: ${input.scenario.description}`,
    `File: ${input.fileName}`,
    `Guild: ${input.guildName ?? "-"}`,
    `Channel: ${input.channelName ?? "-"}`,
    `Keyword Filter: ${trimmedKeyword || "-"}`,
    `Author Filter: ${input.authorFilter || "-"}`,
    `Filtered Message Count: ${totalCount}`,
    `Included In Prompt: ${selectedMessages.length}`
  ].join("\n");

  const conversation = selectedMessages
    .map(
      (item, index) =>
        `[${index + 1}] ${item.timestamp} | ${item.author}\n${item.content || "-"}`
    )
    .join("\n\n");

  if (input.locale === "zh-CN") {
    return [
      "你是资深社群分析师。请基于以下 Discord 数据输出结构化 Markdown 分析。",
      "",
      filteredMeta,
      "",
      "输出要求：",
      "1. 先给一个 1 句话结论。",
      "2. 给出 3-7 条关键发现（可带轻量优先级）。",
      "3. 给出可执行建议（短期/中期）。",
      "4. 若证据不足请明确说明，不要编造。",
      "",
      "聊天记录：",
      conversation
    ].join("\n");
  }

  return [
    "You are a senior community analyst. Produce a structured Markdown analysis from the Discord data below.",
    "",
    filteredMeta,
    "",
    "Output requirements:",
    "1. Start with a one-sentence conclusion.",
    "2. Provide 3-7 key findings (optionally with priority).",
    "3. Provide actionable recommendations (short-term and mid-term).",
    "4. If evidence is insufficient, say so explicitly and do not fabricate.",
    "",
    "Chat records:",
    conversation
  ].join("\n");
}

export default function InsightWorkbench({ locale }: InsightWorkbenchProps) {
  const scenarios: Array<{ key: AnalyzeScenario; title: string; description: string }> = [
    {
      key: "issue_diagnosis",
      title: t(locale, "scenario.issue.title"),
      description: t(locale, "scenario.issue.description")
    },
    {
      key: "community_summary",
      title: t(locale, "scenario.summary.title"),
      description: t(locale, "scenario.summary.description")
    },
    {
      key: "marketing_feedback",
      title: t(locale, "scenario.marketing.title"),
      description: t(locale, "scenario.marketing.description")
    }
  ];

  const [files, setFiles] = useState<ExportFileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [data, setData] = useState<ChatDataResponse | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);
  const [isRenamingFile, setIsRenamingFile] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fileActionStatus, setFileActionStatus] = useState("");
  const [selectedDeleteFiles, setSelectedDeleteFiles] = useState<string[]>([]);
  const [renameFileName, setRenameFileName] = useState("");
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [packedJson, setPackedJson] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("");
  const selectedFileSummary = useMemo(
    () => files.find((item) => item.name === selectedFile) ?? null,
    [files, selectedFile]
  );

  async function refreshFiles(preferredFileName?: string) {
    setIsLoadingFiles(true);
    setLoadError("");

    try {
      const fetched = await fetchExportFiles();
      setFiles(fetched);

      const fallback = fetched[0]?.name ?? "";
      const nextSelected =
        preferredFileName && fetched.some((item) => item.name === preferredFileName)
          ? preferredFileName
          : fallback;
      setSelectedFile(nextSelected);
      setSelectedDeleteFiles((prev) =>
        prev.filter((name) => fetched.some((file) => file.name === name))
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : t(locale, "phase2.error.loadExportFiles")
      );
      setFiles([]);
      setSelectedFile("");
      setSelectedDeleteFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }

  useEffect(() => {
    void refreshFiles();
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setData(null);
      return;
    }

    async function loadSelectedFile() {
      setIsLoadingMessages(true);
      setLoadError("");
      setPackedJson("");
      setCopyStatus("");
      setAnalysisPrompt("");
      setAnalysisError("");
      setAnalysisStatus("");

      try {
        const response = await fetchMessages(selectedFile);
        setData(response);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t(locale, "phase2.error.parseMessages"));
        setData(null);
      } finally {
        setIsLoadingMessages(false);
      }
    }

    void loadSelectedFile();
  }, [selectedFile]);

  useEffect(() => {
    setRenameFileName(selectedFile);
  }, [selectedFile]);

  const filteredMessages = useMemo(() => {
    if (!data) return [];
    const normalizedKeyword = keyword.trim().toLowerCase();

    return data.messages.filter((item) => {
      const authorMatched = authorFilter ? item.author === authorFilter : true;
      if (!authorMatched) return false;
      if (!normalizedKeyword) return true;

      const content = `${item.content} ${item.author}`.toLowerCase();
      return content.includes(normalizedKeyword);
    });
  }, [authorFilter, data, keyword]);

  const displayedMessages = useMemo(
    () => filteredMessages.slice(0, MAX_TABLE_ROWS),
    [filteredMessages]
  );

  function handleQuickKeyword(value: string) {
    setKeyword((prev) => (prev.toLowerCase() === value.toLowerCase() ? "" : value));
  }

  function handleScrapeSuccess(result: ScrapeResult) {
    setFileActionStatus("");
    void refreshFiles(result.output_file);
  }

  function toggleDeleteFile(name: string) {
    setSelectedDeleteFiles((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  }

  async function handleDeleteSelectedFiles() {
    if (selectedDeleteFiles.length === 0) return;
    const confirmed = window.confirm(
      t(locale, "phase2.delete.confirm", { count: selectedDeleteFiles.length })
    );
    if (!confirmed) return;

    setIsDeletingFiles(true);
    setFileActionStatus("");
    setLoadError("");

    try {
      const result = await deleteExportFiles(selectedDeleteFiles);
      const deletedCount = result.deleted.length;
      const failedCount = result.failed.length;

      if (failedCount === 0) {
        setFileActionStatus(t(locale, "phase2.delete.success", { count: deletedCount }));
      } else if (deletedCount === 0) {
        setFileActionStatus(t(locale, "phase2.delete.failed"));
      } else {
        setFileActionStatus(
          t(locale, "phase2.delete.partial", { deleted: deletedCount, failed: failedCount })
        );
      }

      setSelectedDeleteFiles([]);
      await refreshFiles();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t(locale, "phase2.delete.failed"));
    } finally {
      setIsDeletingFiles(false);
    }
  }

  async function handleRenameFile() {
    const oldName = selectedFile.trim();
    const newName = renameFileName.trim();
    if (!oldName) {
      setLoadError(t(locale, "phase2.rename.missingCurrent"));
      return;
    }
    if (!newName) {
      setLoadError(t(locale, "phase2.rename.missingNewName"));
      return;
    }
    if (oldName === newName) {
      setLoadError(t(locale, "phase2.rename.sameName"));
      return;
    }

    setIsRenamingFile(true);
    setFileActionStatus("");
    setLoadError("");

    try {
      const response = await renameExportFile({
        old_name: oldName,
        new_name: newName
      });
      setFileActionStatus(t(locale, "phase2.rename.success", { name: response.new_name }));
      await refreshFiles(response.new_name);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t(locale, "phase2.rename.failed"));
    } finally {
      setIsRenamingFile(false);
    }
  }

  function packCurrentData() {
    if (!data) return;

    const payload = {
      file_name: data.file_name,
      guild_name: data.guild_name,
      channel_name: data.channel_name,
      packed_at: new Date().toISOString(),
      filters: {
        keyword: keyword.trim() || null,
        author: authorFilter || null
      },
      message_count: filteredMessages.length,
      messages: filteredMessages.map((item) => ({
        timestamp: item.timestamp,
        author: item.author,
        content: item.content
      }))
    };

    setPackedJson(JSON.stringify(payload, null, 2));
    setCopyStatus("");
  }

  async function copyPackedData() {
    if (!packedJson) return;

    try {
      await navigator.clipboard.writeText(packedJson);
      setCopyStatus(t(locale, "pack.status.copied"));
    } catch {
      setCopyStatus(t(locale, "pack.status.copyFailed"));
    }
  }

  async function runScenarioAnalysis(scenario: AnalyzeScenario) {
    if (!data || filteredMessages.length === 0) {
      setAnalysisError(t(locale, "phase3.error.noMessages"));
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisStatus("");

    try {
      const prompt = buildChatGptPrompt({
        locale,
        scenario: scenarios.find((item) => item.key === scenario) ?? {
          title: scenario,
          description: ""
        },
        fileName: data.file_name,
        guildName: data.guild_name,
        channelName: data.channel_name,
        keyword,
        authorFilter,
        messages: filteredMessages.map((item) => ({
          timestamp: item.timestamp,
          author: item.author,
          content: item.content
        }))
      });
      setAnalysisPrompt(prompt);

      const openedTab = window.open(CHATGPT_URL, "_blank", "noopener,noreferrer");
      if (!openedTab) {
        setAnalysisStatus(t(locale, "phase3.status.popupBlocked"));
      }

      try {
        await navigator.clipboard.writeText(prompt);
        setAnalysisStatus(
          openedTab
            ? t(locale, "phase3.status.openedAndCopied")
            : t(locale, "phase3.status.copiedOnly")
        );
      } catch {
        setAnalysisStatus(
          openedTab ? t(locale, "phase3.status.openedNotCopied") : t(locale, "phase3.status.copyFailed")
        );
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : t(locale, "phase3.error.requestFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function copyAnalysisPrompt() {
    if (!analysisPrompt) return;
    try {
      await navigator.clipboard.writeText(analysisPrompt);
      setAnalysisStatus(t(locale, "phase3.status.promptCopied"));
    } catch {
      setAnalysisStatus(t(locale, "phase3.status.copyFailed"));
    }
  }

  return (
    <div className="space-y-8">
      <section className="workflow-card mx-auto w-full max-w-6xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-ink">{t(locale, "phase1.title")}</h2>
        <div className="mt-5">
        <ScrapeForm locale={locale} onSuccess={handleScrapeSuccess} />
        </div>
      </section>

      <section className="workflow-card mx-auto w-full max-w-6xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">{t(locale, "phase2.title")}</h2>
          <button
            type="button"
            onClick={() => void refreshFiles()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            {isLoadingFiles ? t(locale, "phase2.button.refreshing") : t(locale, "phase2.button.refresh")}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">
              {t(locale, "phase2.label.exportJsonFile")}
            </span>
            <select
              value={selectedFile}
              onChange={(event) => setSelectedFile(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
              disabled={isLoadingFiles || files.length === 0}
            >
              {files.length === 0 ? (
                <option value="">{t(locale, "phase2.noExportFiles")}</option>
              ) : (
                files.map((file) => (
                  <option key={file.name} value={file.name}>
                    {file.name}
                  </option>
                ))
              )}
            </select>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <button
                type="button"
                onClick={() => setIsManageOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <span>{t(locale, "phase2.manage.open")}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  {isManageOpen
                    ? t(locale, "phase2.manage.collapse")
                    : t(locale, "phase2.manage.expand")}
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-3.5 w-3.5 transition-transform ${isManageOpen ? "rotate-180" : "rotate-0"}`}
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              </button>

              {isManageOpen ? (
                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">{t(locale, "phase2.manage.title")}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDeleteFiles(files.map((file) => file.name))}
                        disabled={files.length === 0 || isDeletingFiles || isRenamingFile}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t(locale, "phase2.delete.selectAll")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDeleteFiles([])}
                        disabled={selectedDeleteFiles.length === 0 || isDeletingFiles || isRenamingFile}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t(locale, "phase2.delete.clear")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSelectedFiles()}
                        disabled={selectedDeleteFiles.length === 0 || isDeletingFiles || isRenamingFile}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeletingFiles ? t(locale, "phase2.delete.deleting") : t(locale, "phase2.delete.button")}
                      </button>
                      <span className="text-xs text-slate-600">
                        {t(locale, "phase2.delete.selected", { count: selectedDeleteFiles.length })}
                      </span>
                    </div>

                    <div className="max-h-32 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                      {files.length === 0 ? (
                        <p className="text-xs text-slate-500">{t(locale, "phase2.noExportFiles")}</p>
                      ) : (
                        files.map((file) => (
                          <label
                            key={file.name}
                            className="flex cursor-pointer items-center gap-2 text-xs text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDeleteFiles.includes(file.name)}
                              onChange={() => toggleDeleteFile(file.name)}
                              disabled={isDeletingFiles || isRenamingFile}
                            />
                            <span className="truncate">{file.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">{t(locale, "phase2.rename.label")}</p>
                    <input
                      value={renameFileName}
                      onChange={(event) => setRenameFileName(event.target.value)}
                      placeholder={t(locale, "phase2.rename.placeholder")}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
                      disabled={!selectedFile || isDeletingFiles || isRenamingFile}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRenameFile()}
                      disabled={!selectedFile || isDeletingFiles || isRenamingFile}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRenamingFile ? t(locale, "phase2.rename.renaming") : t(locale, "phase2.rename.button")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p>
              <span className="font-medium">{t(locale, "phase2.meta.files")}</span> {files.length}
            </p>
            <p>
              <span className="font-medium">{t(locale, "phase2.meta.currentRows")}</span> {filteredMessages.length}
            </p>
            {selectedFile ? (
              <p className="truncate">
                <span className="font-medium">{t(locale, "phase2.meta.size")}</span>{" "}
                {formatFileSize(selectedFileSummary?.size_bytes ?? 0)}
              </p>
            ) : null}
            {selectedFile ? (
              <p className="truncate">
                <span className="font-medium">{t(locale, "phase2.meta.duration")}</span>{" "}
                {formatDuration(selectedFileSummary?.duration_seconds)}
              </p>
            ) : null}
          </div>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </div>
        ) : null}

        {fileActionStatus ? (
          <div className="mt-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            {fileActionStatus}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">
              {t(locale, "phase2.label.keywordSearch")}
            </span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t(locale, "phase2.placeholder.keyword")}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">
              {t(locale, "phase2.label.userFilter")}
            </span>
            <select
              value={authorFilter}
              onChange={(event) => setAuthorFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-sky-100"
            >
              <option value="">{t(locale, "phase2.option.allUsers")}</option>
              {(data?.authors ?? []).map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_KEYWORDS.map((item) => {
            const active = keyword.toLowerCase() === item.toLowerCase();
            return (
              <button
                key={item}
                type="button"
                onClick={() => handleQuickKeyword(item)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-sky-400 bg-sky-100 text-sky-800"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t(locale, "phase2.table.time")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "phase2.table.author")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "phase2.table.content")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingMessages ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={3}>
                      {t(locale, "phase2.table.loading")}
                    </td>
                  </tr>
                ) : displayedMessages.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={3}>
                      {t(locale, "phase2.table.empty")}
                    </td>
                  </tr>
                ) : (
                  displayedMessages.map((item) => (
                    <tr
                      key={item.message_id || `${item.timestamp}-${item.author}-${item.content}`}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateTime(item.timestamp)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{item.author}</td>
                      <td className="min-w-[360px] px-4 py-3 text-slate-700">{item.content || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {filteredMessages.length > MAX_TABLE_ROWS ? (
          <p className="mt-2 text-xs text-slate-500">
            {t(locale, "phase2.table.limit", {
              max: MAX_TABLE_ROWS,
              total: filteredMessages.length
            })}
          </p>
        ) : null}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold text-ink">{t(locale, "pack.title")}</h3>
            <button
              type="button"
              onClick={packCurrentData}
              disabled={!data || isLoadingMessages}
              className="primary-action-button rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                <path d="M21 8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </svg>
              <span>{t(locale, "pack.button.pack")}</span>
            </button>
            <button
              type="button"
              onClick={() => void copyPackedData()}
              disabled={!packedJson}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(locale, "pack.button.copy")}
            </button>
            {copyStatus ? <span className="text-xs text-slate-600">{copyStatus}</span> : null}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            {t(locale, "pack.helper")}
          </p>

          <textarea
            value={packedJson}
            readOnly
            placeholder={t(locale, "pack.placeholder")}
            className="mt-3 h-56 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-700"
          />
        </div>
      </section>

      <section className="workflow-card mx-auto w-full max-w-6xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-ink">{t(locale, "phase3.title")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t(locale, "phase3.subtitle")}
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {scenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              onClick={() => void runScenarioAnalysis(scenario.key)}
              disabled={isAnalyzing || filteredMessages.length === 0}
              className="rounded-xl border border-slate-300 bg-white p-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="text-sm font-semibold text-ink">{scenario.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{scenario.description}</p>
            </button>
          ))}
        </div>

        {isAnalyzing ? (
          <div className="mt-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            {t(locale, "phase3.running")}
          </div>
        ) : null}

        {analysisStatus ? (
          <div className="mt-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            {analysisStatus}
          </div>
        ) : null}

        {analysisError ? (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {analysisError}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold text-ink">{t(locale, "phase3.resultTitle")}</h3>
            <button
              type="button"
              onClick={() => void copyAnalysisPrompt()}
              disabled={!analysisPrompt}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t(locale, "phase3.copyPrompt")}
            </button>
          </div>

          {analysisPrompt ? (
            <textarea
              value={analysisPrompt}
              readOnly
              className="h-80 w-full rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-700"
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              {t(locale, "phase3.empty")}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
