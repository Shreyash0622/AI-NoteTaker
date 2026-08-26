import { Router, type NextFunction, type Request, type Response } from "express";
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
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const isAudioMimeType = file.mimetype.startsWith("audio/");
    const isAudioExtension = [".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac"].includes(
      extension,
    );
    callback(null, isAudioMimeType || isAudioExtension);
  },
});

const ingestBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  transcript: z.string().trim().min(1).optional(),
  source: z.enum(["upload", "meet"]).optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const meetingsRouter = Router();

meetingsRouter.get("/", async (request, response) => {
  const parsedQuery = querySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    response.status(400).json({ error: "Invalid page or pageSize" });
    return;
  }

  const { page, pageSize } = parsedQuery.data;

  const skip = (page - 1) * pageSize;

  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.meeting.count(),
  ]);

  response.json({
    meetings,
    page,
    pageSize,
    total,
  });
});

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

    const baseUrl = (process.env.APP_URL ?? `${request.protocol}://${request.get("host")}`).replace(
      /\/+$/,
      "",
    );
    response.status(202).json({
      notesUrl: `${baseUrl}/meetings/${encodeURIComponent(meeting.id)}/notes`,
    });
  },
);

meetingsRouter.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "File size exceeds the 25MB limit." });
    return;
  }

  next(err);
});

meetingsRouter.get("/:id/notes", async (request, response) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: request.params.id },
    select: { status: true },
  });

  if (!meeting) {
    response.status(404).json({ error: "Meeting not found" });
    return;
  }

  const note = await prisma.note.findUnique({
    where: { meetingId: request.params.id },
    include: { items: true },
  });

  if (!note) {
    if (meeting.status === "pending" || meeting.status === "processing") {
      response.status(202).json({ status: "processing" });
      return;
    }

    if (meeting.status === "failed") {
      response.status(500).json({ error: "Note generation failed" });
      return;
    }

    response.status(404).json({ error: "Notes not found" });
    return;
  }

  response.json(note);
});