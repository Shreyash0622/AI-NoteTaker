import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { generateNotes } from "../prompts/generateNotes.js";
import { postToSlack } from "../api/slack.js";
import { meetingJobOptions } from "./jobOptions.js";
import { createMeetingProcessor } from "./processor.js";

export { createMeetingProcessor } from "./processor.js";
export { meetingJobOptions } from "./jobOptions.js";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1)) || 0 : 0,
  maxRetriesPerRequest: null,
} as const;

const processMeeting = createMeetingProcessor({
  prisma,
  generateNotes,
  postToSlack,
});

const worker = new Worker("process-meeting", processMeeting, {
  connection,
  concurrency: 2,
});

worker.on("completed", (job) => {
  console.log(JSON.stringify({ event: "meeting.completed", jobId: job.id }));
});

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      event: "meeting.failed",
      jobId: job?.id,
      meetingId: job?.data.meetingId,
      attemptsMade: job?.attemptsMade,
      error: { name: error.name, message: error.message, stack: error.stack },
    }),
  );
});

console.log("Meeting-notes worker is ready");

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
