import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { MeetingSource } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { enqueueMeetingIngest } from "../queue.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith("audio/"));
  },
});

const ingestBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  transcript: z.string().trim().min(1).optional(),
  source: z.enum(["upload", "meet"]).optional(),
});

export const meetingsRouter = Router();

meetingsRouter.post(
  "/ingest",
  upload.single("audio"),
  async (request, response) => {
    const parsedBody = ingestBodySchema.safeParse(request.body);
    const hasAudio = Boolean(request.file);

    if (!parsedBody.success) {
      response.status(400).json({ error: "title is required" });
      return;
    }

    const { title, transcript, source } = parsedBody.data;
    if (hasAudio === Boolean(transcript)) {
      response.status(400).json({
        error: "Provide exactly one audio file or transcript",
      });
      return;
    }

    const meetingSource = hasAudio ? MeetingSource.upload : MeetingSource.meet;
    if (source && source !== meetingSource) {
      response.status(400).json({
        error: `source must be ${meetingSource} for this input`,
      });
      return;
    }

    const meeting = await prisma.meeting.create({
      data: {
        title,
        source: meetingSource,
        status: "pending",
        transcript: transcript
          ? {
              create: {
                rawText: transcript,
                diarized: [],
              },
            }
          : undefined,
      },
      select: { id: true },
    });

    try {
      await enqueueMeetingIngest(meeting.id);
    } catch {
      response.status(503).json({ error: "Ingest queue unavailable" });
      return;
    }

    response.status(202).json({ meetingId: meeting.id });
  },
);