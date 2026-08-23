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
- Docker Desktop with Compose

## Run locally

1. Install dependencies:

   ```bash
   npm install
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

   Set `GEMINI_API_KEY` in `.env` using a key from [Google AI Studio](https://aistudio.google.com/api-keys). The note worker uses the current Gemini Flash model configured in `prompts/generateNotes.ts` and does not require a credit card for the free tier.

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

The worker consumes the BullMQ `process-meeting` queue. Jobs contain `{ meetingId }`, retry up to three times with exponential backoff, and are retained for debugging after completion or failure. Replace `generateNotes` in `workers/meeting-notes.worker.ts` with the LLM integration.

## Ingest a meeting

`POST /meetings/ingest` returns `202 Accepted` as soon as the meeting is persisted and the `process-meeting` BullMQ job is queued. Provide exactly one input:

Raw transcript JSON:

```bash
curl -X POST http://localhost:3000/meetings/ingest ^
   -H "Content-Type: application/json" ^
   -d "{\"title\":\"Weekly sync\",\"transcript\":\"Discussion text\"}"
```

Audio upload (`audio` is the multipart field):

```bash
curl -X POST http://localhost:3000/meetings/ingest ^
   -F "title=Weekly sync" ^
   -F "audio=@meeting.mp3"
```

Both requests return `{ "meetingId": "..." }`. The endpoint validates a nonblank title, accepts audio files up to 100 MB, and rejects requests containing both or neither input.
