import "dotenv/config";
import { generateNotes } from "../prompts/generateNotes.ts";

const sampleTranscript = [
  "Maya: We will launch the calendar integration next Tuesday.",
  "Jon: The API work is complete, but the OAuth review is still open.",
  "Priya: I reviewed the flow and approved the current scope.",
  "Maya: Great, let's keep the launch date as planned.",
  "Jon: I will update the setup guide by Friday.",
  "Priya: We will revisit analytics after the first week.",
].join("\n");

try {
  const notes = await generateNotes(sampleTranscript);
  console.log(JSON.stringify(notes, null, 2));
} catch (error) {
  console.error("generateNotes test failed:", error);
  process.exitCode = 1;
}