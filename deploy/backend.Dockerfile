FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DCE_CLI_ASSET_URL=https://github.com/Tyrrrz/DiscordChatExporter/releases/latest/download/DiscordChatExporter.Cli.linux-x64.zip

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app

RUN mkdir -p /app/exports /app/tools/DiscordChatExporter.Cli
RUN curl -L "$DCE_CLI_ASSET_URL" -o /tmp/dce.zip \
    && unzip -q /tmp/dce.zip -d /app/tools/DiscordChatExporter.Cli \
    && chmod +x /app/tools/DiscordChatExporter.Cli/DiscordChatExporter.Cli \
    && rm -f /tmp/dce.zip

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
