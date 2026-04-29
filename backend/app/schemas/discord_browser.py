from pydantic import BaseModel, Field, field_validator


class TokenRequest(BaseModel):
    discord_token: str = Field(..., min_length=10)

    @field_validator("discord_token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        token = value.strip()
        if not token:
            raise ValueError("discord_token cannot be empty.")
        return token


class ChannelListRequest(TokenRequest):
    guild_id: str = Field(..., min_length=1, max_length=32)

    @field_validator("guild_id")
    @classmethod
    def validate_guild_id(cls, value: str) -> str:
        guild_id = value.strip()
        if not guild_id.isdigit():
            raise ValueError("guild_id must be a numeric string.")
        return guild_id


class ThreadListRequest(TokenRequest):
    channel_id: str = Field(..., min_length=1, max_length=32)

    @field_validator("channel_id")
    @classmethod
    def validate_channel_id(cls, value: str) -> str:
        channel_id = value.strip()
        if not channel_id.isdigit():
            raise ValueError("channel_id must be a numeric string.")
        return channel_id


class DiscordGuildItem(BaseModel):
    id: str
    name: str
    icon_url: str | None = None


class DiscordChannelItem(BaseModel):
    id: str
    name: str
    type: int | None = None
    parent_id: str | None = None
    position: int | None = None


class DiscordThreadItem(BaseModel):
    id: str
    name: str
    parent_id: str


class GuildListResponse(BaseModel):
    guilds: list[DiscordGuildItem]


class ChannelListResponse(BaseModel):
    channels: list[DiscordChannelItem]


class ThreadListResponse(BaseModel):
    threads: list[DiscordThreadItem]
