import { Redis } from "ioredis";

export const meetingIngestQueue = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);

export async function enqueueMeetingIngest(meetingId: string): Promise<void> {
  await meetingIngestQueue.lpush(
    "meeting-ingest",
    JSON.stringify({ meetingId }),
  );
}