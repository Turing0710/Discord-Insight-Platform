from dataclasses import dataclass

from openai import APITimeoutError, AuthenticationError, OpenAI, RateLimitError
from openai import APIError as OpenAIAPIError

from app.core.config import Settings
from app.schemas.analyze import AnalyzeRequest, AnalyzeScenario


class MissingAnalyzeConfigError(Exception):
    pass


class AnalyzeAuthError(Exception):
    pass


class AnalyzeRateLimitError(Exception):
    pass


class AnalyzeTimeoutError(Exception):
    pass


class AnalyzeServiceError(Exception):
    pass


@dataclass
class AnalyzeResult:
    model: str
    markdown: str


SYSTEM_PROMPT = (
    "You are a senior community insights analyst for product, operations, and growth teams. "
    "Analyze provided Discord chat snippets and return concise, structured Markdown."
)


SCENARIO_PROMPTS: dict[AnalyzeScenario, str] = {
    AnalyzeScenario.ISSUE_DIAGNOSIS: (
        "Task: Identify product experience pain points from the chat records.\n"
        "Focus areas: lag, crashes, login failures, disconnects, stock availability, payment failures.\n"
        "Output Markdown sections:\n"
        "## Key Problems\n"
        "- bullet list of top pain points with short evidence quotes/paraphrases.\n"
        "## User Impact\n"
        "- short bullets explaining impact severity and affected users.\n"
        "## Suggested Actions\n"
        "- prioritized action items for product/support teams."
    ),
    AnalyzeScenario.COMMUNITY_SUMMARY: (
        "Task: Summarize the core channel discussion into exactly one sentence.\n"
        "Return Markdown with only one line under heading:\n"
        "## One-Line Summary\n"
        "One sentence only."
    ),
    AnalyzeScenario.MARKETING_FEEDBACK: (
        "Task: Extract direct feedback related to games, campaigns, events, and promotions.\n"
        "Prioritize opinions mentioning Roblox, events, sales, trial, giveaway, campaign links, or conversions.\n"
        "Output Markdown sections:\n"
        "## Feedback Signals\n"
        "- grouped bullets (positive, negative, neutral).\n"
        "## Campaign/Product Mentions\n"
        "- bullets listing referenced games/events and user sentiment.\n"
        "## Growth Recommendations\n"
        "- practical next steps for marketing/community ops."
    ),
}


def analyze_with_chatgpt(payload: AnalyzeRequest, settings: Settings) -> AnalyzeResult:
    if not settings.openai_api_key:
        raise MissingAnalyzeConfigError("Missing OPENAI_API_KEY in backend .env.")

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )

    transcript = _build_transcript(payload=payload, settings=settings)
    user_prompt = (
        f"{SCENARIO_PROMPTS[payload.scenario]}\n\n"
        f"Context:\n"
        f"- file_name: {payload.file_name or 'unknown'}\n"
        f"- channel_name: {payload.channel_name or 'unknown'}\n"
        f"- message_count: {len(payload.messages)}\n\n"
        f"Chat records:\n{transcript}"
    )

    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            timeout=90,
        )
    except AuthenticationError as exc:
        raise AnalyzeAuthError("OpenAI API key is invalid or unauthorized.") from exc
    except RateLimitError as exc:
        raise AnalyzeRateLimitError("OpenAI rate limit exceeded. Please retry later.") from exc
    except APITimeoutError as exc:
        raise AnalyzeTimeoutError("Analyze request timed out.") from exc
    except OpenAIAPIError as exc:
        raise AnalyzeServiceError(f"OpenAI API error: {exc}") from exc
    except Exception as exc:
        raise AnalyzeServiceError(f"Unexpected analyze error: {exc}") from exc

    markdown = ""
    if response.choices and response.choices[0].message:
        markdown = (response.choices[0].message.content or "").strip()

    if not markdown:
        raise AnalyzeServiceError("OpenAI returned empty analysis content.")

    return AnalyzeResult(model=settings.openai_model, markdown=markdown)


def _build_transcript(payload: AnalyzeRequest, settings: Settings) -> str:
    max_messages = max(1, settings.analyze_max_messages)
    selected = payload.messages[-max_messages:]

    lines: list[str] = []
    for idx, message in enumerate(selected, start=1):
        content = message.content.strip()
        if not content:
            continue
        lines.append(
            f"[{idx}] time={message.timestamp or '-'} | author={message.author or 'unknown'} | content={content}"
        )

    if not lines:
        return "No non-empty chat content found."
    return "\n".join(lines)
