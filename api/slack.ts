import type { Note, ActionItem } from "@prisma/client";

export type SlackNote = Note & { items: ActionItem[] };

function formatSlackMessage(note: SlackNote): string {
  const actionItems = note.items.length
    ? note.items
        .map((item) => {
          const owner = item.owner ? ` (${item.owner})` : "";
          const dueDate = item.dueDate
            ? ` - due ${item.dueDate.toISOString().slice(0, 10)}`
            : "";
          return `- ${item.task}${owner}${dueDate}`;
        })
        .join("\n")
    : "- None";

  return `*${note.summary}*\n\n*Action items*\n${actionItems}`;
}

export async function postToSlack(note: SlackNote): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: formatSlackMessage(note) }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Slack webhook failed with ${response.status}: ${responseBody.slice(0, 500)}`,
    );
  }
}
