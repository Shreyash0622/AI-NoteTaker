import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "bullmq";
import { createMeetingProcessor } from "../workers/processor.ts";
import { meetingJobOptions } from "../workers/jobOptions.ts";

test("retries failed note generation three times with exponential backoff", async () => {
  assert.equal(meetingJobOptions.attempts, 3);
  assert.deepEqual(meetingJobOptions.backoff, {
    type: "exponential",
    delay: 1000,
  });

  const statuses: string[] = [];
  const fakePrisma = {
    meeting: {
      findUnique: async () => ({
        id: "meeting-1",
        transcript: { rawText: "Maya: Send the report tomorrow." },
      }),
      update: async ({ data }: { data: { status: string } }) => {
        statuses.push(data.status);
        return {};
      },
    },
  } as any;
  const generateNotes = async () => {
    throw new Error("Gemini unavailable");
  };
  const postToSlack = async () => undefined;
  const processMeeting = createMeetingProcessor({
    prisma: fakePrisma,
    generateNotes,
    postToSlack,
  });

  await assert.rejects(
    processMeeting({ data: { meetingId: "meeting-1" } } as Job<{ meetingId: string }>),
    /Gemini unavailable/,
  );
  assert.deepEqual(statuses, ["processing", "failed"]);
});
