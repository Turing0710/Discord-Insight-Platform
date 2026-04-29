from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ExportFileSummary(BaseModel):
    name: str
    size_bytes: int
    modified_at: datetime
    channel_id_hint: str | None = None
    duration_seconds: float | None = None


class ExportListResponse(BaseModel):
    exports: list[ExportFileSummary]


class DeleteExportsRequest(BaseModel):
    file_names: list[str] = Field(..., min_length=1)

    @field_validator("file_names")
    @classmethod
    def validate_file_names(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            name = str(item).strip()
            if name and name not in seen:
                cleaned.append(name)
                seen.add(name)
        if not cleaned:
            raise ValueError("file_names cannot be empty.")
        return cleaned


class DeleteExportsFailure(BaseModel):
    name: str
    reason: str


class DeleteExportsResponse(BaseModel):
    deleted: list[str]
    failed: list[DeleteExportsFailure]


class RenameExportRequest(BaseModel):
    old_name: str = Field(..., min_length=1)
    new_name: str = Field(..., min_length=1)

    @field_validator("old_name", "new_name")
    @classmethod
    def validate_names(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("file name cannot be empty.")
        return cleaned


class RenameExportResponse(BaseModel):
    old_name: str
    new_name: str
    status: str


class ChatMessageItem(BaseModel):
    message_id: str
    timestamp: str
    author: str
    content: str


class ChatDataResponse(BaseModel):
    file_name: str
    guild_name: str | None = None
    channel_name: str | None = None
    message_count: int
    authors: list[str]
    messages: list[ChatMessageItem]
