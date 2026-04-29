import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.schemas.scrape import ScrapeRequest
from app.services.cli_error_parser import summarize_exporter_error
from app.services.subprocess_text import merge_stdout_stderr


class ExporterNotFoundError(Exception):
    pass


class MissingTokenError(Exception):
    pass


class InvalidTokenError(Exception):
    pass


class ExportTimeoutError(Exception):
    pass


class ExportCommandError(Exception):
    pass


def _normalize_channel_name(channel_name: str | None, fallback_channel_id: str) -> str:
    raw_name = (channel_name or "").strip()
    if not raw_name:
        return f"channel-{fallback_channel_id}"

    # Keep filename safe across OS and avoid very long paths.
    safe = re.sub(r"[^\w\-]+", "-", raw_name, flags=re.UNICODE).strip("-_")
    safe = re.sub(r"-{2,}", "-", safe)
    if not safe:
        safe = f"channel-{fallback_channel_id}"
    return safe[:80]


def run_discord_export(payload: ScrapeRequest, settings: Settings) -> Path:
    token = (payload.discord_token or settings.discord_token or "").strip()
    if not token:
        raise MissingTokenError("Missing DISCORD_TOKEN in backend .env.")

    if not settings.exporter_exe.exists():
        raise ExporterNotFoundError(
            f"Cannot find exporter executable: {settings.exporter_exe}"
        )

    settings.export_output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    channel_name_part = _normalize_channel_name(payload.channel_name, payload.channel_id)
    output_file = settings.export_output_dir / (
        f"{timestamp}_{channel_name_part}.json"
    )

    command = [
        *settings.exporter_command,
        "export",
        "--channel",
        payload.channel_id,
        "--format",
        "Json",
        "--after",
        f"{payload.start_date.isoformat()}T00:00:00",
        "--before",
        f"{payload.end_date.isoformat()}T23:59:59",
        "--output",
        str(output_file),
    ]

    environment = os.environ.copy()
    environment["DISCORD_TOKEN"] = token

    started_at = time.perf_counter()

    try:
        result = subprocess.run(
            command,
            cwd=settings.discord_exporter_dir,
            env=environment,
            capture_output=True,
            text=False,
            timeout=settings.export_timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ExportTimeoutError(
            f"Export timed out after {settings.export_timeout_seconds} seconds."
        ) from exc

    cli_output = merge_stdout_stderr(result.stdout, result.stderr)
    normalized_output = cli_output.lower()

    if result.returncode != 0:
        if any(keyword in normalized_output for keyword in ["401", "unauthorized", "invalid token"]):
            raise InvalidTokenError(
                "Discord token is invalid or expired. Please refresh DISCORD_TOKEN."
            )
        raise ExportCommandError(
            summarize_exporter_error(
                cli_output=cli_output,
                fallback="Discord export failed with unknown error.",
            )
        )

    if not output_file.exists():
        raise ExportCommandError(
            "Exporter finished but output JSON was not found. Check exporter arguments."
        )

    elapsed_seconds = time.perf_counter() - started_at
    _write_export_metadata(
        output_file=output_file,
        payload=payload,
        duration_seconds=elapsed_seconds,
    )

    return output_file


def _write_export_metadata(
    output_file: Path, payload: ScrapeRequest, duration_seconds: float
) -> None:
    metadata_dir = output_file.parent / ".metadata"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = metadata_dir / f"{output_file.name}.meta.json"
    metadata = {
        "file_name": output_file.name,
        "channel_id": payload.channel_id,
        "channel_name": payload.channel_name,
        "start_date": payload.start_date.isoformat(),
        "end_date": payload.end_date.isoformat(),
        "duration_seconds": round(duration_seconds, 3),
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
