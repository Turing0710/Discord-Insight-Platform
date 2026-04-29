import re


_PROMO_PATTERNS = (
    "thank you for supporting ukraine",
    "as russia wages a genocidal war",
    "learn more: https://tyrrrz.me/ukraine",
)

_STACK_PREFIXES = (
    "at discordchatexporter.",
    "at llicli.",
    "traceback",
    "exception in thread",
)


def summarize_exporter_error(cli_output: str, fallback: str) -> str:
    lines = _sanitize_lines(cli_output)
    text = "\n".join(lines)
    normalized = text.lower()

    if any(keyword in normalized for keyword in ("invalid token", "unauthorized", " 401", "401 ")):
        return "Discord token is invalid or expired. Please refresh DISCORD_TOKEN."

    if any(keyword in normalized for keyword in ("forbidden", "missing access", " 403", "403 ")):
        target = _extract_request_target(text)
        if target:
            return (
                f"Discord permission denied for '{target}' (403 Forbidden / Missing Access). "
                "Check whether the token account can view this server/channel/sub-option."
            )
        return (
            "Discord permission denied (403 Forbidden / Missing Access). "
            "Check whether the token account can view this server/channel/sub-option."
        )

    if "forum and cannot be exported directly" in normalized:
        return (
            "Selected channel is a forum container and cannot be exported directly. "
            "Please choose a specific sub-option (thread)."
        )

    if any(keyword in normalized for keyword in ("timed out", "timeout")):
        return fallback

    for line in lines:
        lower = line.lower()
        if any(
            keyword in lower
            for keyword in (
                "failed",
                "error",
                "exception",
                "cannot",
                "forbidden",
                "unauthorized",
                "missing access",
            )
        ):
            return _trim_line(line)

    return fallback


def _sanitize_lines(cli_output: str) -> list[str]:
    parsed: list[str] = []
    for raw in cli_output.splitlines():
        line = raw.strip().strip("│").strip("|").strip()
        if not line:
            continue

        lowered = line.lower()
        if any(pattern in lowered for pattern in _PROMO_PATTERNS):
            continue
        if lowered.startswith(_STACK_PREFIXES):
            continue
        if lowered.startswith('file "') and "subprocess.py" in lowered:
            continue
        if lowered.startswith("self._target("):
            continue
        if lowered.startswith("buffer.append("):
            continue
        if lowered.startswith("unicode decode error"):
            continue

        parsed.append(line)
    return parsed


def _extract_request_target(text: str) -> str | None:
    quoted = re.search(r"Request to '([^']+)'", text, flags=re.IGNORECASE)
    if quoted:
        return quoted.group(1).strip()

    unquoted = re.search(r"Request to ([^ ]+) failed", text, flags=re.IGNORECASE)
    if unquoted:
        return unquoted.group(1).strip()

    return None


def _trim_line(line: str, max_len: int = 260) -> str:
    compact = re.sub(r"\s+", " ", line).strip()
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3].rstrip() + "..."
