from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_analyze import router as analyze_router
from app.api.routes_data import router as data_router
from app.api.routes_discord_browser import router as discord_browser_router
from app.api.routes_scrape import router as scrape_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Discord Community Insight API",
    version="0.1.0",
    description="Stage 1/2/3: Scraping, filtering, and ChatGPT-based AI analysis",
)

allow_origins = ["*"] if settings.allow_all_cors_origins else settings.cors_origin_list
allow_credentials = False if settings.allow_all_cors_origins else True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scrape_router)
app.include_router(data_router)
app.include_router(analyze_router)
app.include_router(discord_browser_router)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error. Please retry. If it keeps failing, check backend logs."
        },
    )
