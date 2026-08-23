-- Add the terminal status used by the meeting worker.
ALTER TYPE "MeetingStatus" ADD VALUE IF NOT EXISTS 'done';