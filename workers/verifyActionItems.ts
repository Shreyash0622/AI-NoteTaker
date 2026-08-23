export type ActionItemForVerification = {
  task: string;
  owner?: string | null;
  due_date?: string;
  source_quote: string;
  verified?: boolean;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopWords = new Set([
  "a",
  "an",
  "and",
  "i",
  "said",
  "the",
  "to",
  "was",
  "will",
  "would",
]);

function isSourceQuotePresent(sourceQuote: string, transcriptText: string): boolean {
  const quote = normalize(sourceQuote);
  const transcript = normalize(transcriptText);
  if (!quote || !transcript) {
    return false;
  }
  if (transcript.includes(quote)) {
    return true;
  }

  const quoteWords = [...new Set(quote.split(" "))].filter(
    (word) => word.length > 2 && !stopWords.has(word),
  );
  if (quoteWords.length < 3) {
    return false;
  }

  return transcript
    .split(/\s+/)
    .map((_, index, words) => words.slice(index, index + quoteWords.length + 4))
    .some((window) => {
      const overlap = quoteWords.filter((word) => window.includes(word)).length;
      return overlap / quoteWords.length >= 0.6;
    });
}

export function verifyActionItems<T extends ActionItemForVerification>(
  actionItems: T[],
  transcriptText: string,
): Array<T & { verified: boolean }> {
  return actionItems.map((actionItem) => ({
    ...actionItem,
    verified: isSourceQuotePresent(actionItem.source_quote, transcriptText),
  }));
}
