import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Job } from "bullmq";
import { createMeetingProcessor } from "../workers/processor.ts";
import { meetingJobOptions } from "../workers/jobOptions.ts";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("retries failed note generation three times with exponential backoff", async () => {
  assert.equal(meetingJobOptions.attempts, 3);
  assert.deepEqual(meetingJobOptions.backoff, {
    type: "exponential",
    delay: 1000,
  });

  const tempDirectory = await mkdtemp(path.join(tmpdir(), "ai-note-taker-"));
  const audioPath = path.join(tempDirectory, "meeting-1.mp3");
  await writeFile(audioPath, "fake audio");

  try {
    const statuses: string[] = [];
    const fakePrisma = {
      meeting: {
        findUnique: async () => ({
          id: "meeting-1",
          audioPath,
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
      processMeeting({
        data: { meetingId: "meeting-1" },
        attemptsMade: 2,
        opts: { attempts: 3 },
      } as Job<{ meetingId: string }>),
      /Gemini unavailable/,
    );
    assert.deepEqual(statuses, ["processing", "failed"]);
    assert.equal(await fileExists(audioPath), false);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("does not clean up uploaded audio on non-final retry attempts", async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "ai-note-taker-"));
  const audioPath = path.join(tempDirectory, "meeting-1.mp3");
  await writeFile(audioPath, "fake audio");

  try {
    const statuses: string[] = [];
    const fakePrisma = {
      meeting: {
        findUnique: async () => ({
          id: "meeting-1",
          audioPath,
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
      processMeeting({
        data: { meetingId: "meeting-1" },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<{ meetingId: string }>),
      /Gemini unavailable/,
    );
    assert.deepEqual(statuses, ["processing", "failed"]);
    assert.equal(await fileExists(audioPath), true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
