import os
import subprocess
import json
import shutil
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from pathlib import Path

from app.core.config import Settings
from app.schemas.discord_browser import DiscordChannelItem, DiscordGuildItem, DiscordThreadItem
from app.services.cli_error_parser import summarize_exporter_error
from app.services.subprocess_text import decode_output, merge_stdout_stderr


class BrowserMissingTokenError(Exception):
    pass


class BrowserExporterNotFoundError(Exception):
    pass


class BrowserInvalidTokenError(Exception):
    pass


class BrowserTimeoutError(Exception):
    pass


class BrowserCommandError(Exception):
    pass


DISCORD_API_BASE = "https://discord.com/api/v10"
DISCORD_PERMISSION_ADMINISTRATOR = 1 << 3
DISCORD_PERMISSION_VIEW_CHANNEL = 1 << 10


def fetch_guilds(discord_token: str, settings: Settings) -> list[DiscordGuildItem]:
    try:
        return _fetch_guilds_from_discord_api(discord_token)
    except (BrowserInvalidTokenError, BrowserMissingTokenError):
        raise
    except BrowserCommandError:
        pass

    output = _run_browser_command(
        command=[*settings.exporter_command, "guilds"],
        discord_token=discord_token,
        settings=settings,
    )
    rows = _parse_pipe_rows(output)
    guilds = [
        DiscordGuildItem(id=item_id, name=name, icon_url=None)
        for item_id, name in rows
        if item_id != "0"
    ]
    return guilds


def fetch_channels(
    discord_token: str, guild_id: str, settings: Settings
) -> list[DiscordChannelItem]:
    try:
        return _fetch_channels_from_discord_api(discord_token, guild_id)
    except (BrowserInvalidTokenError, BrowserMissingTokenError):
        raise
    except BrowserCommandError:
        pass

    output = _run_browser_command(
        command=[*settings.exporter_command, "channels", "--guild", guild_id],
        discord_token=discord_token,
        settings=settings,
    )
    rows = _parse_pipe_rows(output)
    return [
        DiscordChannelItem(
            id=item_id,
            name=name,
            type=None,
            parent_id=None,
            position=index,
        )
        for index, (item_id, name) in enumerate(rows)
    ]


def fetch_threads(
    discord_token: str, channel_id: str, settings: Settings
) -> list[DiscordThreadItem]:
    token = (discord_token or "").strip()
    if not token:
        raise BrowserMissingTokenError("Missing Discord token.")
    if not settings.exporter_exe.exists():
        raise BrowserExporterNotFoundError(
            f"Cannot find exporter executable: {settings.exporter_exe}"
        )

    settings.export_output_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = settings.export_output_dir / "__thread_lookup" / (
        f"{channel_id}_{int(time.time() * 1000)}"
    )
    temp_dir.mkdir(parents=True, exist_ok=True)

    command = [
        *settings.exporter_command,
        "export",
        "--channel",
        channel_id,
        "--include-threads",
        "All",
        "--format",
        "Json",
        "--output",
        f"{temp_dir.as_posix()}/",
    ]

    environment = os.environ.copy()
    environment["DISCORD_TOKEN"] = token

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
        raise BrowserTimeoutError(
            f"Discord thread listing timed out after {settings.export_timeout_seconds} seconds."
        ) from exc

    cli_output = merge_stdout_stderr(result.stdout, result.stderr)
    normalized_output = cli_output.lower()
    if any(keyword in normalized_output for keyword in ["401", "unauthorized", "invalid token"]):
        raise BrowserInvalidTokenError("Discord token is invalid or expired.")

    try:
        threads = _parse_threads_from_export_files(temp_dir=temp_dir, parent_channel_id=channel_id)
    finally:
        _cleanup_temp_dir(temp_dir)

    if result.returncode != 0 and not threads:
        if "fetched 0 thread(s)" in normalized_output or "exporting 0 channel(s)" in normalized_output:
            return []
        raise BrowserCommandError(
            summarize_exporter_error(
                cli_output=cli_output,
                fallback="Failed to load sub-option resources.",
            )
        )

    return threads


def _run_browser_command(command: list[str], discord_token: str, settings: Settings) -> str:
    token = (discord_token or "").strip()
    if not token:
        raise BrowserMissingTokenError("Missing Discord token.")

    if not settings.exporter_exe.exists():
        raise BrowserExporterNotFoundError(
            f"Cannot find exporter executable: {settings.exporter_exe}"
        )

    environment = os.environ.copy()
    environment["DISCORD_TOKEN"] = token

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
        raise BrowserTimeoutError(
            f"Discord listing timed out after {settings.export_timeout_seconds} seconds."
        ) from exc

    combined = merge_stdout_stderr(result.stdout, result.stderr)
    normalized = combined.lower()
    if result.returncode != 0:
        if any(word in normalized for word in ["401", "unauthorized", "invalid token"]):
            raise BrowserInvalidTokenError("Discord token is invalid or expired.")
        raise BrowserCommandError(
            summarize_exporter_error(
                cli_output=combined,
                fallback="Failed to load Discord resources.",
            )
        )

    return decode_output(result.stdout)


def _fetch_guilds_from_discord_api(discord_token: str) -> list[DiscordGuildItem]:
    raw_items = _discord_api_request(discord_token, "/users/@me/guilds")
    if not isinstance(raw_items, list):
        raise BrowserCommandError("Discord API returned an invalid guild list.")

    guilds: list[DiscordGuildItem] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        guild_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        if not guild_id or not name:
            continue
        icon_hash = item.get("icon")
        icon_url = (
            f"https://cdn.discordapp.com/icons/{guild_id}/{icon_hash}.webp?size=64"
            if icon_hash
            else None
        )
        guilds.append(DiscordGuildItem(id=guild_id, name=name, icon_url=icon_url))

    return guilds


def _fetch_channels_from_discord_api(
    discord_token: str, guild_id: str
) -> list[DiscordChannelItem]:
    raw_items = _discord_api_request(discord_token, f"/guilds/{guild_id}/channels")
    if not isinstance(raw_items, list):
        raise BrowserCommandError("Discord API returned an invalid channel list.")

    visible_channel_ids = _resolve_visible_channel_ids(
        discord_token=discord_token,
        guild_id=guild_id,
        raw_channels=raw_items,
    )

    channels: list[DiscordChannelItem] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        channel_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        if not channel_id or not name:
            continue
        if visible_channel_ids is not None and channel_id not in visible_channel_ids:
            continue
        parent_id = item.get("parent_id")
        position = item.get("position")
        channel_type = item.get("type")
        channels.append(
            DiscordChannelItem(
                id=channel_id,
                name=name,
                type=channel_type if isinstance(channel_type, int) else None,
                parent_id=str(parent_id) if parent_id else None,
                position=position if isinstance(position, int) else None,
            )
        )

    # Discord returns channels in display order in practice; this keeps that order stable
    # and still handles API clients that return looser ordering.
    return sorted(channels, key=lambda item: (item.position if item.position is not None else 999999))


def _resolve_visible_channel_ids(
    discord_token: str, guild_id: str, raw_channels: list
) -> set[str] | None:
    try:
        raw_user = _discord_api_request(discord_token, "/users/@me")
        raw_member = _discord_api_request(discord_token, f"/users/@me/guilds/{guild_id}/member")
        raw_roles = _discord_api_request(discord_token, f"/guilds/{guild_id}/roles")
    except BrowserMissingTokenError:
        raise
    except (BrowserInvalidTokenError, BrowserCommandError):
        return None

    if not isinstance(raw_user, dict) or not isinstance(raw_member, dict) or not isinstance(raw_roles, list):
        return None

    user_id = str(raw_user.get("id") or "").strip()
    member_role_ids = {
        str(role_id)
        for role_id in raw_member.get("roles", [])
        if str(role_id).strip()
    }
    if not user_id:
        return None

    role_permissions: dict[str, int] = {}
    for role in raw_roles:
        if not isinstance(role, dict):
            continue
        role_id = str(role.get("id") or "").strip()
        if not role_id:
            continue
        role_permissions[role_id] = _parse_permission_value(role.get("permissions"))

    base_permissions = role_permissions.get(guild_id, 0)
    for role_id in member_role_ids:
        base_permissions |= role_permissions.get(role_id, 0)

    if base_permissions & DISCORD_PERMISSION_ADMINISTRATOR:
        return {
            str(item.get("id"))
            for item in raw_channels
            if isinstance(item, dict) and str(item.get("id") or "").strip()
        }

    channel_by_id = {
        str(item.get("id")): item
        for item in raw_channels
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    }

    visible_ids: set[str] = set()
    for channel_id, channel in channel_by_id.items():
        permissions = _compute_channel_permissions(
            base_permissions=base_permissions,
            channel=channel,
            channel_by_id=channel_by_id,
            guild_id=guild_id,
            user_id=user_id,
            member_role_ids=member_role_ids,
        )
        if permissions & DISCORD_PERMISSION_VIEW_CHANNEL:
            visible_ids.add(channel_id)

    return visible_ids


def _compute_channel_permissions(
    base_permissions: int,
    channel: dict,
    channel_by_id: dict[str, dict],
    guild_id: str,
    user_id: str,
    member_role_ids: set[str],
) -> int:
    permissions = base_permissions
    parent_id = str(channel.get("parent_id") or "").strip()
    parent = channel_by_id.get(parent_id) if parent_id else None
    channel_overwrites = channel.get("permission_overwrites")
    parent_overwrites = parent.get("permission_overwrites") if isinstance(parent, dict) else None

    # Child channels that do not carry their own overwrites inherit category visibility.
    overwrites = channel_overwrites if channel_overwrites else parent_overwrites
    if isinstance(overwrites, list):
        permissions = _apply_permission_overwrites(
            permissions=permissions,
            overwrites=overwrites,
            guild_id=guild_id,
            user_id=user_id,
            member_role_ids=member_role_ids,
        )

    return permissions


def _apply_permission_overwrites(
    permissions: int,
    overwrites: list,
    guild_id: str,
    user_id: str,
    member_role_ids: set[str],
) -> int:
    everyone_overwrite = _find_overwrite(overwrites, guild_id)
    if everyone_overwrite:
        permissions = _apply_single_overwrite(permissions, everyone_overwrite)

    role_allow = 0
    role_deny = 0
    for overwrite in overwrites:
        if not isinstance(overwrite, dict):
            continue
        overwrite_id = str(overwrite.get("id") or "")
        if overwrite_id in member_role_ids:
            role_allow |= _parse_permission_value(overwrite.get("allow"))
            role_deny |= _parse_permission_value(overwrite.get("deny"))
    permissions &= ~role_deny
    permissions |= role_allow

    member_overwrite = _find_overwrite(overwrites, user_id)
    if member_overwrite:
        permissions = _apply_single_overwrite(permissions, member_overwrite)

    return permissions


def _apply_single_overwrite(permissions: int, overwrite: dict) -> int:
    deny = _parse_permission_value(overwrite.get("deny"))
    allow = _parse_permission_value(overwrite.get("allow"))
    permissions &= ~deny
    permissions |= allow
    return permissions


def _find_overwrite(overwrites: list, overwrite_id: str) -> dict | None:
    for overwrite in overwrites:
        if isinstance(overwrite, dict) and str(overwrite.get("id") or "") == overwrite_id:
            return overwrite
    return None


def _parse_permission_value(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _discord_api_request(discord_token: str, path: str):
    token = (discord_token or "").strip()
    if not token:
        raise BrowserMissingTokenError("Missing Discord token.")

    request = Request(
        f"{DISCORD_API_BASE}{path}",
        headers={
            "Authorization": token,
            "User-Agent": "DiscordBot (https://discord.com, 1.0)",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise BrowserInvalidTokenError("Discord token is invalid or expired.") from exc
        raise BrowserCommandError(f"Discord API request failed with HTTP {exc.code}.") from exc
    except URLError as exc:
        raise BrowserCommandError("Discord API request failed.") from exc

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise BrowserCommandError("Discord API returned invalid JSON.") from exc


def _parse_threads_from_export_files(
    temp_dir: Path, parent_channel_id: str
) -> list[DiscordThreadItem]:
    items: dict[str, DiscordThreadItem] = {}
    for file_path in temp_dir.glob("*.json"):
        try:
            raw_data = json.loads(file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(raw_data, dict):
            continue
        channel_obj = raw_data.get("channel")
        if not isinstance(channel_obj, dict):
            continue
        thread_id = str(channel_obj.get("id") or "").strip()
        thread_name = str(channel_obj.get("name") or "").strip()
        if not thread_id or not thread_name:
            continue
        if not thread_id.isdigit():
            continue
        items[thread_id] = DiscordThreadItem(
            id=thread_id,
            name=thread_name,
            parent_id=parent_channel_id,
        )

    return sorted(items.values(), key=lambda x: (x.name.lower(), x.id))


def _cleanup_temp_dir(temp_dir: Path) -> None:
    removed = False
    for _ in range(3):
        try:
            if temp_dir.exists():
                shutil.rmtree(temp_dir)
            removed = True
            break
        except OSError:
            time.sleep(0.3)
    if not removed:
        if os.name == "nt":
            try:
                subprocess.run(
                    ["cmd", "/c", "rd", "/s", "/q", str(temp_dir)],
                    check=False,
                    capture_output=True,
                    text=True,
                )
            except Exception:
                shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            shutil.rmtree(temp_dir, ignore_errors=True)

    parent = temp_dir.parent
    try:
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass


def _parse_pipe_rows(text: str) -> list[tuple[str, str]]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    rows: list[tuple[str, str]] = []
    for line in lines:
        if "|" not in line:
            continue
        item_id, name = line.split("|", 1)
        parsed_id = item_id.strip()
        parsed_name = name.strip()
        if not parsed_id or not parsed_name:
            continue
        if not parsed_id.isdigit():
            continue
        rows.append((parsed_id, parsed_name))
    return rows
