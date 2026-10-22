-- CreateEnum
CREATE TYPE "StoryMode" AS ENUM ('faithful', 'creative');

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "mode" "StoryMode" NOT NULL DEFAULT 'faithful';
