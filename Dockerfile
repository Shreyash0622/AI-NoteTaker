FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 py3-pip
COPY package*.json ./
RUN npm ci
COPY requirements.txt ./
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY tsconfig.json ./
COPY api ./api
COPY db ./db
COPY prompts ./prompts
COPY workers ./workers
COPY scripts/transcribe_audio.py ./scripts/transcribe_audio.py
RUN npx prisma generate --schema=db/schema.prisma
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache python3 py3-pip
COPY package*.json ./
RUN npm ci --omit=dev
COPY requirements.txt ./
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/scripts/transcribe_audio.py ./scripts/transcribe_audio.py
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["sh", "-c", "node dist/workers/meeting-notes.worker.js & exec node dist/api/server.js"]
