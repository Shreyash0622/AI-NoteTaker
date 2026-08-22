-- CreateEnum
CREATE TYPE "MeetingSource" AS ENUM ('upload', 'meet');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "source" "MeetingSource" NOT NULL DEFAULT 'upload';
ALTER TABLE "Meeting" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Meeting" ALTER COLUMN "status" TYPE "MeetingStatus" USING ("status"::"MeetingStatus");
ALTER TABLE "Meeting" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "Meeting" DROP COLUMN "transcript";
ALTER TABLE "Meeting" DROP COLUMN "notes";
ALTER TABLE "Meeting" DROP COLUMN "updatedAt";

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "diarized" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "decisions" JSONB NOT NULL,
    "actionItems" JSONB NOT NULL,
    "openQuestions" JSONB NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "sourceQuote" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_meetingId_key" ON "Transcript"("meetingId");
CREATE UNIQUE INDEX "Note_meetingId_key" ON "Note"("meetingId");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
