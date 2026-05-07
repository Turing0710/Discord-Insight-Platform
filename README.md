# Discord Insight Platform

Discord Insight Platform is a local-first web dashboard for collecting Discord community messages, filtering exported JSON records, and preparing ChatGPT-ready analysis prompts.

It is built for internal community, product, support, growth, and game operation workflows.

## Quick Start For Windows Users

This is the easiest path for non-developers.

1. Install prerequisites:
   - Python 3.12+
   - Node.js 20+
   - npm, included with Node.js
   - .NET Runtime, only needed if your DiscordChatExporter build requires it
2. Download this repository from GitHub, or run:

```powershell
git clone https://github.com/Turing0710/Discord-Insight-Platform.git
cd Discord-Insight-Platform
```

3. Double-click:

```text
Start-Discord-Insight-Platform.bat
```

The first run will:

- Create `backend/.env`
- Create `frontend/.env.local`
- Install Python dependencies
- Install frontend npm dependencies
- Download DiscordChatExporter.Cli into `backend/tools/DiscordChatExporter.Cli`
- Start the backend and frontend
- Open `http://127.0.0.1:3000`

After the first run, users can usually just double-click the same `.bat` file again.

## Quick Start For macOS / Linux Users

```bash
git clone https://github.com/Turing0710/Discord-Insight-Platform.git
cd Discord-Insight-Platform
chmod +x scripts/setup.sh scripts/start-dev.sh
./scripts/setup.sh
./scripts/start-dev.sh
```

Open:

```text
http://127.0.0.1:3000
```

## Features

- Phase 1 Scraping
  - Enter a `DISCORD_TOKEN` in the web UI or provide a backend default in `.env`.
  - Load Discord server list from the token account.
  - Load channels grouped by category, with multi-select channel export.
  - Optional manual Sub-option ID fallback for thread/post URLs.
  - Export Discord messages through `DiscordChatExporter.Cli`.
  - Long-running exports are handled as background jobs with frontend polling.

- Phase 2 Data Filtering
  - Select exported JSON files.
  - Shows file count, current rows, size, and export duration when available.
  - Manage files: select, delete, and rename.
  - Keyword search and quick filters.
  - User filter.
  - Message table preview.
  - Pack filtered records into an AI-ready JSON payload.

- Phase 3 AI Analysis
  - No OpenAI API key is required for normal use.
  - Scenario buttons generate a prompt from filtered records.
  - The app copies the prompt and opens the user's own ChatGPT.

- UI
  - English and Simplified Chinese.
  - Light and dark mode.
  - Modern internal dashboard style.

## Tech Stack

- Frontend: Next.js 14, React 18, TailwindCSS
- Backend: Python 3.12, FastAPI, Uvicorn
- Export engine: DiscordChatExporter.Cli, called from Python through `subprocess`
- Optional legacy backend analysis API: OpenAI-compatible Python SDK route remains available, but the current frontend does not require it

## Important Safety Notes

`DISCORD_TOKEN` is sensitive. Treat it like a password.

- Use only your own Discord account.
- Do not commit `.env` files.
- Do not share screenshots or logs containing tokens.
- Prefer local or trusted private environments.
- This project is intended for legitimate internal analysis of communities you are allowed to access.

## Repository Layout

```text
discord-insight-platform/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- schemas/
|   |   `-- services/
|   |-- exports/
|   |   `-- .gitkeep
|   |-- tools/
|   |   `-- DiscordChatExporter.Cli/
|   |       `-- README.md
|   |-- .env.example
|   `-- requirements.txt
|-- frontend/
|   |-- app/
|   |-- components/
|   |-- lib/
|   |-- public/
|   |-- .env.local.example
|   `-- package.json
|-- deploy/
|   |-- backend.Dockerfile
|   |-- frontend.Dockerfile
|   |-- Caddyfile
|   `-- .env.prod.example
|-- scripts/
|   |-- setup.ps1
|   |-- start-dev.ps1
|   |-- setup.sh
|   `-- start-dev.sh
|-- Start-Discord-Insight-Platform.bat
|-- docker-compose.prod.yml
|-- render.yaml
|-- LICENSE
`-- README.md
```

## Prerequisites

For local development:

- Python 3.12+
- Node.js 20+
- npm
- .NET Runtime if you use a `.dll` DiscordChatExporter build
- DiscordChatExporter.Cli runtime files for your operating system. The setup scripts try to download these automatically.

For Docker production:

- Docker Engine
- Docker Compose plugin

The backend Docker image downloads the Linux x64 DiscordChatExporter.Cli automatically during image build.

## Local Install On Windows

From the repository root:

For most Windows users, use the one-click launcher:

```text
Start-Discord-Insight-Platform.bat
```

For manual setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

The setup script automatically downloads DiscordChatExporter.Cli when possible. If the download fails, manually place the runtime files into `backend/tools/DiscordChatExporter.Cli/`.

Start the app:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

If ports `3000` or `8000` are already occupied by an older local run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -StopExisting
```

Open:

```text
http://127.0.0.1:3000
```

## Local Install On macOS / Linux

```bash
chmod +x scripts/setup.sh scripts/start-dev.sh
./scripts/setup.sh
```

The setup script automatically downloads DiscordChatExporter.Cli when possible. If the download fails, manually place the runtime files into `backend/tools/DiscordChatExporter.Cli/`.

Start the app:

```bash
./scripts/start-dev.sh
```

Open:

```text
http://127.0.0.1:3000
```

## Manual Local Startup

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Environment Files

Backend:

```text
backend/.env.example -> backend/.env
```

Frontend:

```text
frontend/.env.local.example -> frontend/.env.local
```

`DISCORD_TOKEN` in `backend/.env` is optional because the UI can accept user-entered tokens. If you provide a backend default, keep it private.

## Production With Docker Compose

Copy production env:

```bash
cp deploy/.env.prod.example deploy/.env.prod
```

Edit:

```text
DOMAIN=insight.your-domain.com
NEXT_PUBLIC_API_BASE_URL=https://insight.your-domain.com
```

Start:

```bash
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build
```

Verify:

```bash
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml ps
curl https://insight.your-domain.com/health
```

## Render Deployment

This repository includes `render.yaml` for a two-service deployment:

- `discord-insight-backend`
- `discord-insight-frontend`

Steps:

1. Push this repository to GitHub.
2. Open Render.
3. New -> Blueprint.
4. Select this repository.
5. Set backend environment variables if needed.
6. Deploy.

More details:

```text
deploy/ALWAYS_ON_RENDER.md
```

## API Overview

- `GET /health`
- `POST /api/discord/guilds`
- `POST /api/discord/channels`
- `POST /api/scrape/jobs`
- `GET /api/scrape/jobs/{job_id}`
- `GET /api/exports`
- `GET /api/messages?file_name=<name.json>`
- `POST /api/exports/delete`
- `POST /api/exports/rename`

## What Is Not Committed

The following are intentionally ignored:

- Real `.env` files
- Exported Discord JSON data
- Runtime logs
- Python virtual environments
- Node modules
- Next.js build outputs
- DiscordChatExporter.Cli binaries

## License

This project is released under the MIT License.

DiscordChatExporter.Cli is a separate third-party project with its own license and terms.
