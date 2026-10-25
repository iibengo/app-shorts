-- AlterTable
ALTER TABLE "Story" ADD COLUMN "voiceId" TEXT,
ADD COLUMN "voiceLanguage" TEXT,
ADD COLUMN "audioJson" JSONB;
