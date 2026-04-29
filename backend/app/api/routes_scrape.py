from threading import Lock, Thread
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.scrape import (
    ScrapeJobCreateResponse,
    ScrapeJobStatusResponse,
    ScrapeRequest,
    ScrapeResponse,
)
from app.services.discord_exporter import (
    ExportCommandError,
    ExporterNotFoundError,
    ExportTimeoutError,
    InvalidTokenError,
    MissingTokenError,
    run_discord_export,
)

router = APIRouter(prefix="/api", tags=["scraping"])

_jobs_lock = Lock()
_scrape_jobs: dict[str, ScrapeJobStatusResponse] = {}


def _error_message_from_exception(exc: Exception) -> str:
    return str(exc) or "Discord export failed."


def _run_scrape_job(job_id: str, payload: ScrapeRequest, settings: Settings) -> None:
    with _jobs_lock:
        _scrape_jobs[job_id] = ScrapeJobStatusResponse(job_id=job_id, status="running")

    try:
        output_path = run_discord_export(payload, settings)
        result = ScrapeResponse(
            status="success",
            output_file=output_path.name,
            output_path=str(output_path),
            channel_id=payload.channel_id,
        )
        next_state = ScrapeJobStatusResponse(
            job_id=job_id,
            status="success",
            result=result,
        )
    except (MissingTokenError, ExporterNotFoundError, InvalidTokenError, ExportTimeoutError, ExportCommandError) as exc:
        next_state = ScrapeJobStatusResponse(
            job_id=job_id,
            status="failed",
            error=_error_message_from_exception(exc),
        )
    except Exception as exc:
        next_state = ScrapeJobStatusResponse(
            job_id=job_id,
            status="failed",
            error=f"Unexpected backend error: {_error_message_from_exception(exc)}",
        )

    with _jobs_lock:
        _scrape_jobs[job_id] = next_state


@router.post("/scrape", response_model=ScrapeResponse)
def scrape_channel(
    payload: ScrapeRequest, settings: Settings = Depends(get_settings)
) -> ScrapeResponse:
    try:
        output_path = run_discord_export(payload, settings)
    except MissingTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except ExporterNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except ExportTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except ExportCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return ScrapeResponse(
        status="success",
        output_file=output_path.name,
        output_path=str(output_path),
        channel_id=payload.channel_id,
    )


@router.post("/scrape/jobs", response_model=ScrapeJobCreateResponse)
def create_scrape_job(
    payload: ScrapeRequest, settings: Settings = Depends(get_settings)
) -> ScrapeJobCreateResponse:
    job_id = uuid4().hex
    with _jobs_lock:
        _scrape_jobs[job_id] = ScrapeJobStatusResponse(job_id=job_id, status="queued")

    worker = Thread(
        target=_run_scrape_job,
        args=(job_id, payload, settings),
        daemon=True,
    )
    worker.start()
    return ScrapeJobCreateResponse(job_id=job_id, status="queued")


@router.get("/scrape/jobs/{job_id}", response_model=ScrapeJobStatusResponse)
def get_scrape_job(job_id: str) -> ScrapeJobStatusResponse:
    with _jobs_lock:
        job = _scrape_jobs.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scrape job not found.",
        )
    return job
