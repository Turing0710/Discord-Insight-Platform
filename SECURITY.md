# Security Policy

## Sensitive Data

Never commit:

- `backend/.env`
- `frontend/.env.local`
- `deploy/.env.prod`
- Discord tokens
- OpenAI API keys
- Exported Discord JSON files
- Runtime logs that may include request metadata

## Discord Token Safety

`DISCORD_TOKEN` can grant account-level access. Treat it as a password.

Use only your own account and only in trusted environments.

## Reporting A Security Issue

If you discover a security issue, do not publish exploit details publicly.
Open a private issue/contact channel with the repository maintainer if available.

## Third-Party Components

DiscordChatExporter.Cli is not vendored in this repository. Users should download it from the upstream project or use the Docker image, which downloads it during build.
