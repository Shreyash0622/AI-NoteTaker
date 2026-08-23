export const meetingJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
};
