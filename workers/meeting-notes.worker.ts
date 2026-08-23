import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { Prisma, MeetingStatus } from "@prisma/client";
import { prisma } from "../db/client.js";

type GeneratedNotes = {
  summary: string;
  topics: Prisma.InputJsonValue;
  decisions: Prisma.InputJsonValue;
  actionItems: Prisma.InputJsonValue;
  openQuestions: Prisma.InputJsonValue;
  schemaVersion: string;
};

export async function generateNotes(transcript: string): Promise<GeneratedNotes> {
  return {
    summary: `Placeholder notes for transcript (${transcript.length} characters)`,
    topics: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    schemaVersion: "1",
  };
}

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1)) || 0 : 0,
  maxRetriesPerRequest: null,
} as const;

async function processMeeting(job: Job<{ meetingId: string }>): Promise<void> {
  const { meetingId } = job.data;
  let meetingIdForFailure: string | undefined;
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { transcript: true },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} was not found`);
    }
    meetingIdForFailure = meeting.id;

    if (!meeting.transcript) {
      throw new Error(`Transcript for meeting ${meetingId} was not found`);
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.processing },
    });

    const notes = await generateNotes(meeting.transcript.rawText);
    await prisma.note.upsert({
      where: { meetingId },
      create: { meetingId, ...notes },
      update: notes,
    });
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.done },
    });
  } catch (error) {
    if (meetingIdForFailure) {
      await prisma.meeting.update({
        where: { id: meetingIdForFailure },
        data: { status: MeetingStatus.failed },
      });
    }
    throw error;
  }
}

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
