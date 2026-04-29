from enum import Enum

from pydantic import BaseModel, Field


class AnalyzeScenario(str, Enum):
    ISSUE_DIAGNOSIS = "issue_diagnosis"
    COMMUNITY_SUMMARY = "community_summary"
    MARKETING_FEEDBACK = "marketing_feedback"


class AnalyzeMessage(BaseModel):
    timestamp: str = ""
    author: str = ""
    content: str = ""


class AnalyzeRequest(BaseModel):
    scenario: AnalyzeScenario
    file_name: str | None = None
    channel_name: str | None = None
    messages: list[AnalyzeMessage] = Field(..., min_length=1, max_length=2000)


class AnalyzeResponse(BaseModel):
    scenario: AnalyzeScenario
    model: str
    markdown: str
