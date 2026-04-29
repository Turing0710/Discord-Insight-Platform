from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.discord_browser import (
    ChannelListRequest,
    ChannelListResponse,
    GuildListResponse,
    ThreadListRequest,
    ThreadListResponse,
    TokenRequest,
)
from app.services.discord_browser import (
    BrowserCommandError,
    BrowserExporterNotFoundError,
    BrowserInvalidTokenError,
    BrowserMissingTokenError,
    BrowserTimeoutError,
    fetch_channels,
    fetch_guilds,
    fetch_threads,
)

router = APIRouter(prefix="/api/discord", tags=["discord-browser"])


@router.post("/guilds", response_model=GuildListResponse)
def get_guilds(
    payload: TokenRequest, settings: Settings = Depends(get_settings)
) -> GuildListResponse:
    try:
        guilds = fetch_guilds(discord_token=payload.discord_token, settings=settings)
    except BrowserMissingTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BrowserExporterNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except BrowserInvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except BrowserTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except BrowserCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return GuildListResponse(guilds=guilds)


@router.post("/channels", response_model=ChannelListResponse)
def get_channels(
    payload: ChannelListRequest, settings: Settings = Depends(get_settings)
) -> ChannelListResponse:
    try:
        channels = fetch_channels(
            discord_token=payload.discord_token,
            guild_id=payload.guild_id,
            settings=settings,
        )
    except BrowserMissingTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BrowserExporterNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except BrowserInvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except BrowserTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except BrowserCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return ChannelListResponse(channels=channels)


@router.post("/threads", response_model=ThreadListResponse)
def get_threads(
    payload: ThreadListRequest, settings: Settings = Depends(get_settings)
) -> ThreadListResponse:
    try:
        threads = fetch_threads(
            discord_token=payload.discord_token,
            channel_id=payload.channel_id,
            settings=settings,
        )
    except BrowserMissingTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except BrowserExporterNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except BrowserInvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except BrowserTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except BrowserCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return ThreadListResponse(threads=threads)
