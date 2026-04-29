import json
import re
from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.schemas.data import (
    ChatDataResponse,
    ChatMessageItem,
    DeleteExportsFailure,
    ExportFileSummary,
)

CHANNEL_FILE_PATTERN = re.compile(r"^channel_(\d+)_\d{8}_\d{8}_\d{8}_\d{6}\.json$")


class ExportFileNotFoundError(Exception):
    pass


class ExportFileInvalidError(Exception):
    pass


class ExportParseError(Exception):
    pass


class ExportFileConflictError(Exception):
    pass


def delete_export_files(
    file_names: list[str], settings: Settings
) -> tuple[list[str], list[DeleteExportsFailure]]:
    deleted: list[str] = []
    failed: list[DeleteExportsFailure] = []

    for file_name in file_names:
        try:
            file_path = _resolve_export_file(file_name=file_name, settings=settings)
        except ExportFileNotFoundError:
            failed.append(DeleteExportsFailure(name=file_name, reason="File not found."))
            continue
        except ExportFileInvalidError:
            failed.append(DeleteExportsFailure(name=file_name, reason="Invalid file name."))
            continue

        try:
            file_path.unlink()
            _metadata_path_for(file_path).unlink(missing_ok=True)
            deleted.append(file_name)
        except OSError:
            failed.append(DeleteExportsFailure(name=file_name, reason="Failed to delete file."))

    return deleted, failed


def rename_export_file(old_name: str, new_name: str, settings: Settings) -> str:
    source = _resolve_export_file(file_name=old_name, settings=settings)
    normalized_new_name = _normalize_export_name(new_name)
    export_dir = settings.export_output_dir.resolve()
    target = (export_dir / normalized_new_name).resolve()

    if target.parent != export_dir:
        raise ExportFileInvalidError("Invalid target file path.")
    if target.exists():
        raise ExportFileConflictError(f"Target file already exists: {normalized_new_name}")

    try:
        source.rename(target)
        source_metadata = _metadata_path_for(source)
        target_metadata = _metadata_path_for(target)
        if source_metadata.exists():
            target_metadata.parent.mkdir(parents=True, exist_ok=True)
            if target_metadata.exists():
                target_metadata.unlink()
            source_metadata.rename(target_metadata)
    except OSError as exc:
        raise ExportParseError(f"Failed to rename export file: {old_name}") from exc

    return normalized_new_name


def list_export_summaries(settings: Settings) -> list[ExportFileSummary]:
    settings.export_output_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(
        settings.export_output_dir.glob("*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    summaries: list[ExportFileSummary] = []

    for item in files:
        match = CHANNEL_FILE_PATTERN.match(item.name)
        channel_hint = match.group(1) if match else None
        stat = item.stat()
        summaries.append(
            ExportFileSummary(
                name=item.name,
                size_bytes=stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime),
                channel_id_hint=channel_hint,
                duration_seconds=_read_duration_seconds(item),
            )
        )

    return summaries


def load_chat_data(file_name: str, settings: Settings) -> ChatDataResponse:
    file_path = _resolve_export_file(file_name=file_name, settings=settings)

    try:
        raw_data = json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ExportParseError(f"Failed to parse JSON file: {file_name}") from exc
    except OSError as exc:
        raise ExportParseError(f"Failed to read export file: {file_name}") from exc

    raw_messages = raw_data.get("messages", [])
    if not isinstance(raw_messages, list):
        raise ExportParseError(f"Invalid messages format in file: {file_name}")

    messages: list[ChatMessageItem] = []
    authors_set: set[str] = set()

    for item in raw_messages:
        if not isinstance(item, dict):
            continue

        author_obj = item.get("author") if isinstance(item.get("author"), dict) else {}
        author_name = (
            str(author_obj.get("nickname") or author_obj.get("name") or "Unknown").strip()
            or "Unknown"
        )
        authors_set.add(author_name)

        content = item.get("content")
        content_text = str(content).strip() if isinstance(content, str) else ""
        if not content_text:
            attachments = item.get("attachments")
            if isinstance(attachments, list) and attachments:
                file_names = [
                    str(attachment.get("fileName")).strip()
                    for attachment in attachments
                    if isinstance(attachment, dict) and attachment.get("fileName")
                ]
                if file_names:
                    content_text = f"[Attachment] {', '.join(file_names)}"

        messages.append(
            ChatMessageItem(
                message_id=str(item.get("id") or ""),
                timestamp=str(item.get("timestamp") or ""),
                author=author_name,
                content=content_text,
            )
        )

    guild_name = None
    if isinstance(raw_data.get("guild"), dict):
        guild_name = raw_data["guild"].get("name")

    channel_name = None
    if isinstance(raw_data.get("channel"), dict):
        channel_name = raw_data["channel"].get("name")

    return ChatDataResponse(
        file_name=file_name,
        guild_name=str(guild_name) if guild_name else None,
        channel_name=str(channel_name) if channel_name else None,
        message_count=len(messages),
        authors=sorted(authors_set),
        messages=messages,
    )


def _resolve_export_file(file_name: str, settings: Settings) -> Path:
    if not file_name or Path(file_name).name != file_name:
        raise ExportFileInvalidError("Invalid file_name. Use export file name only.")

    export_dir = settings.export_output_dir.resolve()
    target = (export_dir / file_name).resolve()
    if target.parent != export_dir:
        raise ExportFileInvalidError("Invalid file path.")
    if not target.exists() or not target.is_file():
        raise ExportFileNotFoundError(f"Export file not found: {file_name}")
    if target.suffix.lower() != ".json":
        raise ExportFileInvalidError("Only .json export files are supported.")

    return target


def _normalize_export_name(file_name: str) -> str:
    candidate = file_name.strip()
    if not candidate:
        raise ExportFileInvalidError("Invalid file_name.")
    if Path(candidate).name != candidate:
        raise ExportFileInvalidError("Invalid file_name.")
    if "." not in candidate:
        candidate = f"{candidate}.json"
    if not candidate.lower().endswith(".json"):
        raise ExportFileInvalidError("Only .json export files are supported.")
    return candidate


def _metadata_path_for(export_file: Path) -> Path:
    return export_file.parent / ".metadata" / f"{export_file.name}.meta.json"


def _read_duration_seconds(export_file: Path) -> float | None:
    metadata_path = _metadata_path_for(export_file)
    if not metadata_path.exists():
        return None

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    duration = metadata.get("duration_seconds")
    if isinstance(duration, (int, float)) and duration >= 0:
        return float(duration)
    return None
