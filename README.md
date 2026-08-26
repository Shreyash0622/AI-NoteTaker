# AI Note Taker Backend

Node.js + Express + TypeScript backend for an AI meeting-notes application. PostgreSQL stores meeting data, Redis is available for background jobs, and Prisma provides database access.

## Project layout

```text
api/        Express app and HTTP routes
workers/    Background job processors
db/         Prisma schema, client, and migrations
prompts/    LLM prompts and output schemas
```

## Prerequisites

- Node.js 20 or newer
- Python 3.9 or newer
- Docker Desktop with Compose

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

   Install the Python transcription dependency:

   ```bash
   python -m pip install -r requirements.txt
   ```

2. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d
   ```

3. Create the local environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env` instead.

   Set `GEMINI_API_KEY` in `.env` using a key from [Google AI Studio](https://aistudio.google.com/api-keys), and set `GROQ_API_KEY` using a key from [Groq Console](https://console.groq.com/keys). Groq's free developer tier is suitable for this demo but has usage limits. Set `SLACK_WEBHOOK_URL` to enable optional Slack notifications.

   Set `ALLOWED_ORIGINS` to your frontend origin(s), comma-separated when allowing more than one (for example, `http://localhost:5173,https://your-frontend.example.com`). If unset, the API allows `http://localhost:5173` by default.

   Set `APP_URL` to the public API origin when deployed, for example `https://your-service.onrender.com`. Locally, the API derives the origin from the request.

4. Generate the Prisma client and apply the committed migration:

   ```bash
   npm run db:generate
   npm run db:deploy
   ```

   For later schema changes during development, use `npm run db:migrate -- --name <change-name>`.

5. Start the API in watch mode:

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:3000`. Check it with `GET /health`.

6. In a second terminal, start the worker:

   ```bash
   npm run worker
   ```

## Useful commands

```bash
npm run build          # Compile TypeScript to dist/
npm start              # Run the compiled API
npm run db:deploy      # Apply committed migrations
npm run db:studio      # Open Prisma Studio
npm run worker:build   # Run the compiled worker

docker compose logs -f postgres redis
docker compose down     # Stop services and keep volumes
docker compose down -v  # Stop services and delete local data
```

The worker consumes the BullMQ `process-meeting` queue. Jobs contain `{ meetingId }`, retry up to three times with exponential backoff, and are retained for debugging after completion or failure. Audio uploads are stored in `uploads/`, transcribed with Groq Whisper, and saved as timestamped JSON in `transcripts/` before note generation. Local disk storage is intended for this demo and is not durable across multiple hosted instances.

## Ingest a meeting

`POST /meetings/ingest` returns `202 Accepted` as soon as the meeting is persisted and the `process-meeting` BullMQ job is queued. Provide exactly one input:

Raw transcript JSON:

```bash
curl -X POST http://localhost:3000/meetings/ingest \
   -H "Content-Type: application/json" \
   -d '{"title":"Weekly sync","transcript":"Discussion text"}'
```

On Windows PowerShell, use `curl.exe` and the PowerShell line-continuation character:

```powershell
curl.exe -X POST http://localhost:3000/meetings/ingest `
   -H "Content-Type: application/json" `
   -d '{"title":"Weekly sync","transcript":"Discussion text"}'
```

Audio upload (`audio` is the multipart field):

```bash
curl -X POST http://localhost:3000/meetings/ingest \
   -F "title=Weekly sync" \
   -F "audio=@meeting.mp3"
```

On Windows PowerShell:

```powershell
curl.exe -X POST http://localhost:3000/meetings/ingest `
   -F "title=Weekly sync" `
   -F "audio=@meeting.mp3"
```

Both requests return `{ "notesUrl": "https://your-api-host/meetings/.../notes" }`.

`GET /meetings/:id/notes` is poll-friendly while processing:

- Returns `202 { "status": "processing" }` when the meeting is still `pending` or `processing`
- Returns the saved note JSON once processing is complete

The ingest endpoint validates a nonblank title, accepts audio files up to 25 MB, and rejects requests containing both or neither input.

## List meetings

`GET /meetings` returns paginated meetings ordered by `createdAt` descending.

Query params:

- `page` (default `1`)
- `pageSize` (default `20`, max `100`)

Response shape:

```json
{
   "meetings": [
      {
         "id": "...",
         "title": "Weekly sync",
         "source": "upload",
         "status": "done",
         "createdAt": "2026-08-26T12:34:56.000Z"
      }
   ],
   "page": 1,
   "pageSize": 20,
   "total": 42
}
```


## Standalone transcription

To transcribe an MP3 without the API worker, set `GROQ_API_KEY` and run:

```bash
python scripts/transcribe_audio.py meeting.mp3
```

This writes `transcript.json` with the full `text` and a `segments` array containing `start`, `end`, and segment text. Use `--output path/to/file.json` to choose another output path.

## Free deployment

The included `render.yaml` targets Render's free web-service tier. Connect the repository in Render and create a Blueprint from that file. Add free-tier `DATABASE_URL` and `REDIS_URL` values from Neon and Upstash, respectively, plus `GEMINI_API_KEY`; `SLACK_WEBHOOK_URL` is optional.

The Docker service runs the API and BullMQ worker together because Render's separate background-worker service is not free. Render's free service sleeps when idle, so this is suitable for a student demo rather than reliable production processing. The GitHub Actions workflow runs tests and builds the same image on every push.
