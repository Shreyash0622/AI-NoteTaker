import { Prisma, MeetingStatus } from "@prisma/client";
import type { Job } from "bullmq";
import { prisma } from "../db/client.js";
import { generateNotes } from "../prompts/generateNotes.js";
import { postToSlack } from "../api/slack.js";
import { verifyActionItems } from "./verifyActionItems.js";

export function createMeetingProcessor(
  dependencies: {
    prisma: typeof prisma;
    generateNotes: typeof generateNotes;
    postToSlack: typeof postToSlack;
  },
) {
  return async function processMeeting(
    job: Job<{ meetingId: string }>,
  ): Promise<void> {
    const { meetingId } = job.data;
    let meetingIdForFailure: string | undefined;
    try {
      const meeting = await dependencies.prisma.meeting.findUnique({
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

      await dependencies.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.processing },
      });

      const notes = await dependencies.generateNotes(meeting.transcript.rawText);
      const verifiedActionItems = verifyActionItems(
        notes.action_items,
        meeting.transcript.rawText,
      );
      const savedNote = await dependencies.prisma.$transaction(async (transaction) => {
        const note = await transaction.note.upsert({
          where: { meetingId },
          create: {
            meetingId,
            summary: notes.summary,
            topics: notes.topics as Prisma.InputJsonValue,
            decisions: notes.decisions as Prisma.InputJsonValue,
            actionItems: notes.action_items as Prisma.InputJsonValue,
            openQuestions: notes.open_questions as Prisma.InputJsonValue,
            schemaVersion: "1",
          },
          update: {
            summary: notes.summary,
            topics: notes.topics as Prisma.InputJsonValue,
            decisions: notes.decisions as Prisma.InputJsonValue,
            actionItems: notes.action_items as Prisma.InputJsonValue,
            openQuestions: notes.open_questions as Prisma.InputJsonValue,
            schemaVersion: "1",
          },
        });

        await transaction.actionItem.deleteMany({ where: { noteId: note.id } });
        await transaction.actionItem.createMany({
          data: verifiedActionItems.map((item) => ({
            noteId: note.id,
            task: item.task,
            owner: item.owner || null,
            dueDate: parseDueDate(item.due_date),
            sourceQuote: item.source_quote,
            verified: item.verified,
          })),
        });

        return transaction.note.findUniqueOrThrow({
          where: { id: note.id },
          include: { items: true },
        });
      });

      try {
        await dependencies.postToSlack(savedNote);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "meeting.slack_failed",
            meetingId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      await dependencies.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.done },
      });
    } catch (error) {
      if (meetingIdForFailure) {
        await dependencies.prisma.meeting.update({
          where: { id: meetingIdForFailure },
          data: { status: MeetingStatus.failed },
        });
      }
      throw error;
    }
  };
}

function parseDueDate(value: string): Date | null {
  const date = new Date(value);
  return value.trim() && !Number.isNaN(date.getTime()) ? date : null;
}
