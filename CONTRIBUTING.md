# Contributing

Thanks for helping improve Discord Insight Platform.

## Local Development

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

macOS/Linux:

```bash
chmod +x scripts/setup.sh scripts/start-dev.sh
./scripts/setup.sh
./scripts/start-dev.sh
```

## Checks

Backend:

```bash
cd backend
python -m compileall app
```

Frontend:

```bash
cd frontend
npx tsc --noEmit
```

## Pull Request Guidelines

- Do not commit secrets or exported Discord data.
- Keep UI text in `frontend/lib/i18n.ts` for English and Simplified Chinese.
- Keep backend API schemas typed with Pydantic models.
- Prefer small, focused changes.
