# Always-On Deployment (No Dependence On Your PC)

This deployment runs both frontend and backend on Render, so the website can stay online when your local computer is off.

## 1. Push This Repo To GitHub

Render deploys from GitHub. Make sure the latest code is pushed.

## 2. Create Services From `render.yaml`

1. Open Render dashboard.
2. Click `New` -> `Blueprint`.
3. Select this repository.
4. Render will detect `render.yaml` and create:
   - `discord-insight-backend`
   - `discord-insight-frontend`

## 3. Set Environment Variables

The current frontend lets users paste `DISCORD_TOKEN` in the browser, so backend `DISCORD_TOKEN` is optional.

Optional backend variables:

- `DISCORD_TOKEN` if you want a backend default token
- `EXPORT_TIMEOUT_SECONDS` default: `1800`
- `CORS_ORIGINS` default: `*`

Optional legacy analysis variables:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

The current Phase 3 does not need an OpenAI API key. It generates a prompt, copies it, and opens the user's own ChatGPT.

## 4. Deploy

After setting env vars, trigger deploy or redeploy the Blueprint.

## 5. Open Public URL

Use the frontend URL from Render, for example:

```text
https://discord-insight-frontend.onrender.com
```

## Notes

- Free plans may sleep after inactivity; first request can be slow.
- Some enterprise networks may block public platforms. This is outside app control.
- For stronger uptime, use a paid plan and custom domain.
