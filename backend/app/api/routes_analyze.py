from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse
from app.services.chatgpt_analyzer import (
    AnalyzeAuthError,
    AnalyzeRateLimitError,
    AnalyzeServiceError,
    AnalyzeTimeoutError,
    MissingAnalyzeConfigError,
    analyze_with_chatgpt,
)

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_messages(
    payload: AnalyzeRequest, settings: Settings = Depends(get_settings)
) -> AnalyzeResponse:
    try:
        result = analyze_with_chatgpt(payload=payload, settings=settings)
    except MissingAnalyzeConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except AnalyzeAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except AnalyzeRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except AnalyzeTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except AnalyzeServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return AnalyzeResponse(
        scenario=payload.scenario,
        model=result.model,
        markdown=result.markdown,
    )
