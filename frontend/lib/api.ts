export type ScrapePayload = {
  discord_token?: string;
  channel_id: string;
  channel_name?: string;
  start_date: string;
  end_date: string;
};

export type ScrapeResult = {
  status: string;
  output_file: string;
  output_path: string;
  channel_id: string;
};

export type ScrapeJobCreateResponse = {
  job_id: string;
  status: string;
};

export type ScrapeJobStatusResponse = {
  job_id: string;
  status: "queued" | "running" | "success" | "failed" | string;
  result: ScrapeResult | null;
  error: string | null;
};

export type ExportFileSummary = {
  name: string;
  size_bytes: number;
  modified_at: string;
  channel_id_hint: string | null;
  duration_seconds: number | null;
};

export type ExportsResponse = {
  exports: ExportFileSummary[];
};

export type DeleteExportFailure = {
  name: string;
  reason: string;
};

export type DeleteExportsResponse = {
  deleted: string[];
  failed: DeleteExportFailure[];
};

export type RenameExportPayload = {
  old_name: string;
  new_name: string;
};

export type RenameExportResponse = {
  old_name: string;
  new_name: string;
  status: string;
};

export type ChatMessage = {
  message_id: string;
  timestamp: string;
  author: string;
  content: string;
};

export type ChatDataResponse = {
  file_name: string;
  guild_name: string | null;
  channel_name: string | null;
  message_count: number;
  authors: string[];
  messages: ChatMessage[];
};

export type AnalyzeScenario = "issue_diagnosis" | "community_summary" | "marketing_feedback";

export type AnalyzePayload = {
  scenario: AnalyzeScenario;
  file_name?: string | null;
  channel_name?: string | null;
  messages: Array<{
    timestamp: string;
    author: string;
    content: string;
  }>;
};

export type AnalyzeResponse = {
  scenario: AnalyzeScenario;
  model: string;
  markdown: string;
};

export type DiscordGuild = {
  id: string;
  name: string;
  icon_url: string | null;
};

export type DiscordChannel = {
  id: string;
  name: string;
  type: number | null;
  parent_id: string | null;
  position: number | null;
};

export type DiscordThread = {
  id: string;
  name: string;
  parent_id: string;
};

type GuildsResponse = {
  guilds: DiscordGuild[];
};

type ChannelsResponse = {
  channels: DiscordChannel[];
};

type ThreadsResponse = {
  threads: DiscordThread[];
};

function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  const responseText = await response.text();
  const json = (() => {
    if (!responseText.trim()) {
      return { detail: "Backend returned an empty response." };
    }
    try {
      return JSON.parse(responseText);
    } catch {
      const compact = responseText.replace(/\s+/g, " ").trim();
      const snippet = compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
      return { detail: `Backend returned a non-JSON response: ${snippet}` };
    }
  })();

  if (!response.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "Request failed.";
    throw new Error(detail);
  }

  return json as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function triggerScrape(payload: ScrapePayload): Promise<ScrapeResult> {
  const job = await requestJson<ScrapeJobCreateResponse>("/api/scrape/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  for (let attempt = 0; attempt < 1200; attempt += 1) {
    await sleep(2000);
    const state = await requestJson<ScrapeJobStatusResponse>(`/api/scrape/jobs/${job.job_id}`, {
      method: "GET"
    });

    if (state.status === "success" && state.result) {
      return state.result;
    }
    if (state.status === "failed") {
      throw new Error(state.error || "Discord export failed.");
    }
  }

  throw new Error("Export is still running after 40 minutes. Please narrow the date range or try again later.");
}

export async function fetchDiscordGuilds(discordToken: string): Promise<DiscordGuild[]> {
  const response = await requestJson<GuildsResponse>("/api/discord/guilds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      discord_token: discordToken
    })
  });
  return response.guilds;
}

export async function fetchDiscordChannels(
  discordToken: string,
  guildId: string
): Promise<DiscordChannel[]> {
  const response = await requestJson<ChannelsResponse>("/api/discord/channels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      discord_token: discordToken,
      guild_id: guildId
    })
  });
  return response.channels;
}

export async function fetchDiscordThreads(
  discordToken: string,
  channelId: string
): Promise<DiscordThread[]> {
  const response = await requestJson<ThreadsResponse>("/api/discord/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      discord_token: discordToken,
      channel_id: channelId
    })
  });
  return response.threads;
}

export async function fetchExportFiles(): Promise<ExportFileSummary[]> {
  const response = await requestJson<ExportsResponse>("/api/exports", {
    method: "GET"
  });
  return response.exports;
}

export async function deleteExportFiles(fileNames: string[]): Promise<DeleteExportsResponse> {
  return requestJson<DeleteExportsResponse>("/api/exports/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      file_names: fileNames
    })
  });
}

export async function renameExportFile(payload: RenameExportPayload): Promise<RenameExportResponse> {
  return requestJson<RenameExportResponse>("/api/exports/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchMessages(fileName: string): Promise<ChatDataResponse> {
  const query = new URLSearchParams({ file_name: fileName });
  return requestJson<ChatDataResponse>(`/api/messages?${query.toString()}`, {
    method: "GET"
  });
}

export async function analyzeMessages(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  return requestJson<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}
