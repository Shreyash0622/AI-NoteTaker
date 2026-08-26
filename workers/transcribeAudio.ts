import { mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Transcription = {
  text: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
};

export async function transcribeAudio(
  audioPath: string,
  meetingId: string,
): Promise<Transcription> {
  const outputDirectory = path.join(process.cwd(), "transcripts");
  const outputPath = path.join(outputDirectory, `${meetingId}.json`);
  await mkdir(outputDirectory, { recursive: true });

  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  try {
    await execFileAsync(
      python,
      [path.join(process.cwd(), "scripts", "transcribe_audio.py"), audioPath, "--output", outputPath],
      { timeout: 120000 },
    );
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    const details = execError.stderr?.trim() || execError.message || "Unknown transcription error";
    throw new Error(`Transcription command failed: ${details}`);
  }

  const result = JSON.parse(await readFile(outputPath, "utf8")) as Partial<Transcription>;
  if (typeof result.text !== "string" || !Array.isArray(result.segments)) {
    throw new Error("Transcription output is missing text or segments");
  }
  return { text: result.text, segments: result.segments };
}
