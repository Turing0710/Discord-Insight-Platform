import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    discord_token: str = Field(default="", alias="DISCORD_TOKEN")
    discord_exporter_dir: Path = Field(
        default=BASE_DIR / "tools" / "DiscordChatExporter.Cli",
        alias="DISCORD_EXPORTER_DIR",
    )
    discord_exporter_executable: str = Field(
        default="",
        alias="DISCORD_EXPORTER_EXECUTABLE",
    )
    export_output_dir: Path = Field(default=BASE_DIR / "exports", alias="EXPORT_OUTPUT_DIR")
    export_timeout_seconds: int = Field(default=1800, alias="EXPORT_TIMEOUT_SECONDS")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        alias="OPENAI_BASE_URL",
    )
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    analyze_max_messages: int = Field(default=300, alias="ANALYZE_MAX_MESSAGES")
    cors_origins: str = Field(
        default="*",
        alias="CORS_ORIGINS",
    )

    @field_validator("discord_exporter_dir", "export_output_dir", mode="before")
    @classmethod
    def _resolve_path(cls, value: str | Path) -> Path:
        path = Path(value)
        if not path.is_absolute():
            path = (BASE_DIR / path).resolve()
        return path

    @property
    def exporter_exe(self) -> Path:
        explicit = self.discord_exporter_executable.strip()
        if explicit:
            explicit_path = Path(explicit)
            if not explicit_path.is_absolute():
                explicit_path = (self.discord_exporter_dir / explicit_path).resolve()
            return explicit_path

        if os.name == "nt":
            candidates = [
                self.discord_exporter_dir / "DiscordChatExporter.Cli.exe",
                self.discord_exporter_dir / "DiscordChatExporter.Cli",
                self.discord_exporter_dir / "DiscordChatExporter.Cli.dll",
            ]
        else:
            candidates = [
                self.discord_exporter_dir / "DiscordChatExporter.Cli",
                self.discord_exporter_dir / "DiscordChatExporter.Cli.dll",
                self.discord_exporter_dir / "DiscordChatExporter.Cli.exe",
            ]

        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[0]

    @property
    def exporter_command(self) -> list[str]:
        exporter = self.exporter_exe
        if exporter.suffix.lower() == ".dll":
            return ["dotnet", str(exporter)]
        return [str(exporter)]

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allow_all_cors_origins(self) -> bool:
        return "*" in self.cors_origin_list


@lru_cache
def get_settings() -> Settings:
    return Settings()
