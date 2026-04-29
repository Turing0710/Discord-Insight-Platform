from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import Settings, get_settings
from app.schemas.data import (
    ChatDataResponse,
    DeleteExportsRequest,
    DeleteExportsResponse,
    ExportListResponse,
    RenameExportRequest,
    RenameExportResponse,
)
from app.services.export_reader import (
    ExportFileConflictError,
    ExportFileInvalidError,
    ExportFileNotFoundError,
    ExportParseError,
    delete_export_files,
    list_export_summaries,
    load_chat_data,
    rename_export_file,
)

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/exports", response_model=ExportListResponse)
def get_export_files(settings: Settings = Depends(get_settings)) -> ExportListResponse:
    return ExportListResponse(exports=list_export_summaries(settings))


@router.get("/messages", response_model=ChatDataResponse)
def get_export_messages(
    file_name: str = Query(..., min_length=1),
    settings: Settings = Depends(get_settings),
) -> ChatDataResponse:
    try:
        return load_chat_data(file_name=file_name, settings=settings)
    except ExportFileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ExportFileInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ExportParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/exports/delete", response_model=DeleteExportsResponse)
def delete_export_files_batch(
    payload: DeleteExportsRequest,
    settings: Settings = Depends(get_settings),
) -> DeleteExportsResponse:
    deleted, failed = delete_export_files(payload.file_names, settings)
    return DeleteExportsResponse(deleted=deleted, failed=failed)


@router.post("/exports/rename", response_model=RenameExportResponse)
def rename_export(
    payload: RenameExportRequest,
    settings: Settings = Depends(get_settings),
) -> RenameExportResponse:
    try:
        renamed = rename_export_file(payload.old_name, payload.new_name, settings)
    except ExportFileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ExportFileInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ExportFileConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ExportParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return RenameExportResponse(old_name=payload.old_name, new_name=renamed, status="success")
