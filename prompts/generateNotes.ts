import {
  FunctionCallingMode,
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai";
import type { FunctionDeclaration } from "@google/generative-ai";
import { z } from "zod";

const meetingNotesFunction: FunctionDeclaration = {
  name: "meeting_notes",
  description: "Structured notes extracted from a meeting transcript",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: { type: SchemaType.STRING },
      summary: { type: SchemaType.STRING },
      topics: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            topic: { type: SchemaType.STRING },
            discussion: { type: SchemaType.STRING },
          },
          required: ["topic", "discussion"],
        },
      },
      decisions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      action_items: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            task: { type: SchemaType.STRING },
            owner: { type: SchemaType.STRING },
            due_date: { type: SchemaType.STRING },
            source_quote: { type: SchemaType.STRING },
          },
          required: ["task", "owner", "due_date", "source_quote"],
        },
      },
      open_questions: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
    },
    required: [
      "title",
      "summary",
      "topics",
      "decisions",
      "action_items",
      "open_questions",
    ],
  },
};

const meetingNotesSchema = z.object({
  title: z.string(),
  summary: z.string(),
  topics: z.array(
    z.object({
      topic: z.string(),
      discussion: z.string(),
    }),
  ),
  decisions: z.array(z.string()),
  action_items: z.array(
    z.object({
      task: z.string(),
      owner: z.string(),
      due_date: z.string(),
      source_quote: z.string(),
    }),
  ),
  open_questions: z.array(z.string()),
});

export type GeneratedMeetingNotes = z.infer<typeof meetingNotesSchema>;

const systemInstruction =
  "You are a meeting-notes assistant. Only include action items and decisions that were explicitly stated — never infer commitments that weren't actually said. Use diarization labels if a speaker's name isn't clear. Keep the summary factual and neutral. Every action item must include the exact source line it came from.";

const modelName = "gemini-3.5-flash";
const maxRateLimitRetries = 3;
const maxMalformedRetries = 1;

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    status?: number;
    statusCode?: number;
    message?: string;
  };
  return (
    candidate.status === 429 ||
    candidate.statusCode === 429 ||
    candidate.message?.includes("429") === true ||
    candidate.message?.toLowerCase().includes("rate limit") === true
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function generateNotes(
  transcript: string,
): Promise<GeneratedMeetingNotes> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!transcript.trim()) {
    throw new Error("Cannot generate notes from an empty transcript");
  }

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName,
    systemInstruction,
  });
  let malformedRetries = 0;
  let rateLimitRetries = 0;

  while (true) {
    try {
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `Extract structured meeting notes from this transcript:\n\n${transcript}` }],
          },
        ],
        tools: [{ functionDeclarations: [meetingNotesFunction] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: ["meeting_notes"],
          },
        },
      });

      const functionCall = result.response.functionCalls()?.find(
        (call) => call.name === "meeting_notes",
      );
      if (!functionCall) {
        throw new Error("Gemini response did not contain a meeting_notes function call");
      }

      const parsed = meetingNotesSchema.safeParse(functionCall.args);
      if (!parsed.success) {
        throw new Error(`Malformed meeting_notes arguments: ${parsed.error.message}`);
      }
      return parsed.data;
    } catch (error) {
      if (isRateLimitError(error) && rateLimitRetries < maxRateLimitRetries) {
        const delay = 500 * 2 ** rateLimitRetries;
        rateLimitRetries += 1;
        await sleep(delay);
        continue;
      }

      if (!isRateLimitError(error) && malformedRetries < maxMalformedRetries) {
        malformedRetries += 1;
        continue;
      }

      throw new Error(`Gemini note generation failed: ${getErrorMessage(error)}`, {
        cause: error,
      });
    }
  }
}
