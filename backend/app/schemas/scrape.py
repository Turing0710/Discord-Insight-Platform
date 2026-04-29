from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


class ScrapeRequest(BaseModel):
    discord_token: str | None = None
    channel_id: str = Field(..., min_length=5, max_length=32)
    channel_name: str | None = Field(default=None, max_length=200)
    start_date: date
    end_date: date

    @field_validator("discord_token")
    @classmethod
    def validate_discord_token(cls, value: str | None) -> str | None:
        if value is None:
            return None
        token = value.strip()
        return token or None

    @field_validator("channel_id")
    @classmethod
    def validate_channel_id(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("Channel ID must be a numeric string.")
        return value

    @field_validator("channel_name")
    @classmethod
    def validate_channel_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_date_range(self) -> "ScrapeRequest":
        if self.start_date > self.end_date:
            raise ValueError("Start Date must be earlier than or equal to End Date.")
        return self


class ScrapeResponse(BaseModel):
    status: str
    output_file: str
    output_path: str
    channel_id: str


class ScrapeJobCreateResponse(BaseModel):
    job_id: str
    status: str


class ScrapeJobStatusResponse(BaseModel):
    job_id: str
    status: str
    result: ScrapeResponse | None = None
    error: str | None = None
