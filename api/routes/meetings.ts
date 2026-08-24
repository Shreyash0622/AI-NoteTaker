import { Router } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

    let audioPath: string | undefined;
    if (request.file) {
      const uploadsDirectory = path.join(process.cwd(), "uploads");
      await mkdir(uploadsDirectory, { recursive: true });
      audioPath = path.join(
        uploadsDirectory,
        `${randomUUID()}${path.extname(request.file.originalname).toLowerCase() || ".mp3"}`,
      );
      await writeFile(audioPath, request.file.buffer);
    }

    const meeting = await prisma.meeting.create({
      data: {
        title,
        source: meetingSource,
        status: "pending",
        audioPath,
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

meetingsRouter.get("/:id/notes", async (request, response) => {
  const note = await prisma.note.findUnique({
    where: { meetingId: request.params.id },
    include: { items: true },
  });

  if (!note) {
    response.status(404).json({ error: "Notes not found" });
    return;
  }

  response.json(note);
});