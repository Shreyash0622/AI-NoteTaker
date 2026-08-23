import assert from "node:assert/strict";
import test from "node:test";
import { verifyActionItems } from "../workers/verifyActionItems.ts";

test("verifies an action item with an exact source quote", () => {
  const [actionItem] = verifyActionItems(
    [{ task: "Send the report", source_quote: "Maya: I will send the report tomorrow." }],
    "Maya: I will send the report tomorrow.",
  );

  assert.equal(actionItem.verified, true);
});

test("does not verify an action item whose source quote is absent", () => {
  const [actionItem] = verifyActionItems(
    [{ task: "Book the room", source_quote: "Jon: I will book the room." }],
    "Jon: I will send the agenda.",
  );

  assert.equal(actionItem.verified, false);
});

test("verifies a partial or lightly paraphrased source quote", () => {
  const [actionItem] = verifyActionItems(
    [{
      task: "Send the updated contract",
      source_quote: "send updated contract to legal Friday",
    }],
    "Priya said she would send the updated contract to legal before Friday.",
  );

  assert.equal(actionItem.verified, true);
});
