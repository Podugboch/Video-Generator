# Reel: topic in, 30-second explainer video out

React + Vite frontend, FastAPI backend, ARQ worker, Supabase (auth, database, storage),
Anthropic (script), fal.ai (images), ElevenLabs (voice), FFmpeg (video), Paystack (credits).

```
React app -> FastAPI -> Redis queue -> Worker -> LLM / images / voice / FFmpeg
                |                          |
                +---------- Supabase ------+
```

## 1. Accounts you need

| Service | What for | Where to get the key |
|---|---|---|
| Supabase | login, database, file storage | Project Settings -> API (URL, anon key, service-role key) |
| Anthropic | writes the storyboard | console.anthropic.com |
| fal.ai | images | fal.ai dashboard -> Keys |
| ElevenLabs | voiceover | elevenlabs.io -> API keys |
| Paystack | selling credits (optional while testing) | dashboard -> Settings -> API (use the TEST secret key first) |

## 2. Set up Supabase (5 minutes)

1. Create a project.
2. Open **SQL editor**, paste all of `schema.sql`, and run it.
3. While developing, go to **Authentication -> Providers -> Email** and turn off "Confirm email"
   so you can sign up without checking your inbox.

## 3. Run the backend

```bash
cp backend/.env.example backend/.env     # then fill in the keys
docker compose up --build                # starts Redis, the API (port 8000) and the worker
```

Check http://localhost:8000/health returns `{"ok": true}`, and http://localhost:8000/docs lists the endpoints.

Use Docker (or WSL on Windows): the worker needs FFmpeg and ARQ does not run natively on Windows.

## 4. Run the frontend

```bash
cd frontend
cp .env.example .env                     # Supabase URL + anon key, API URL
npm install
npm run dev                              # http://localhost:5173
```

## 5. Try it

Sign up (you get 6 credits = one full video), type a topic, edit the storyboard, press
**Generate video**. Expect one to three minutes.

## Credits and prices

Set in `backend/app/config.py`: a storyboard costs 1 credit, a render costs 5, and `PACKS`
holds the credit packs (placeholder prices in kobo). Work out your real cost per video first,
then price the packs so each credit earns a margin.

## Paystack

- Locally, nothing extra is needed: after paying, Paystack redirects to `/?reference=...` and the
  app calls `/credits/verify`, which adds the credits.
- In production, also add this webhook URL in the Paystack dashboard so credits arrive even if the
  user closes the tab: `https://YOUR-API/webhooks/paystack`.

## Deploy

- **Frontend:** Vercel, Netlify, or Render Static Site. Root directory `frontend`, build `npm run build`, output `dist`,
  and set the three `VITE_` variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`).
- **Backend:** Railway or Render. Three services from `backend/` (same Dockerfile):
  `api` (default command), `worker` (command `arq app.worker.WorkerSettings`), and a Redis add-on.
  Copy the `.env` values into each service and set `FRONTEND_URL` to your real site URL.
- **Render Blueprint:** A ready-to-deploy `render.yaml` Blueprint is included in the root directory. You can deploy the Frontend (Static Site), Backend API (Docker Web Service), and Redis Key-Value instance automatically via the Render Dashboard (New -> Blueprint) or Render CLI.

## Models you can swap (env vars)

- `ANTHROPIC_MODEL` (default `claude-haiku-5-5`)
- `FAL_IMAGE_MODEL` (default `fal-ai/flux/schnell`; try a better FLUX or Seedream model for quality)
- `ELEVENLABS_VOICE_ID` (default is a premade voice; free ElevenLabs plans cannot use library voices over the API)

## Known limits of this MVP

- No per-scene image preview before rendering: images appear after the first render, and any edit
  re-renders the video (it only pays for images and voice that changed, but the 5-credit render fee applies).
- No rate limiting beyond credits and "one render at a time per user". Add one before going public.
- Old image, audio and video files are never deleted. Add a cleanup job once storage grows.
- If the worker machine dies mid-render, that project stays "rendering" until the 20-minute stale
  timer lets the user retry, and credits for that job are not refunded automatically.
- Videos are 16:9 at 720p with slow zoom motion on still images (not generated video clips).
