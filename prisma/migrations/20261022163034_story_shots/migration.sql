/*
  Warnings:

  - Added the required column `maxDurationSeconds` to the `Story` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plannedDurationSeconds` to the `Story` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shotCount` to the `Story` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetDurationSeconds` to the `Story` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StoryPlatform" AS ENUM ('tiktok', 'reels');

-- CreateEnum
CREATE TYPE "StoryCostMode" AS ENUM ('budget', 'standard', 'production');

-- AlterTable
ALTER TABLE "Scene" ALTER COLUMN "visualPrompt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "costMode" "StoryCostMode" NOT NULL DEFAULT 'standard',
ADD COLUMN     "finalDurationSeconds" INTEGER,
ADD COLUMN     "maxDurationSeconds" INTEGER,
ADD COLUMN     "plannedDurationSeconds" INTEGER,
ADD COLUMN     "platform" "StoryPlatform" NOT NULL DEFAULT 'tiktok',
ADD COLUMN     "shotCount" INTEGER,
ADD COLUMN     "targetDurationSeconds" INTEGER;

UPDATE "Story"
SET "targetDurationSeconds" = "sceneCount" * 6,
    "maxDurationSeconds" = "sceneCount" * 6,
    "plannedDurationSeconds" = "sceneCount" * 6,
    "shotCount" = "sceneCount";

ALTER TABLE "Story"
  ALTER COLUMN "targetDurationSeconds" SET NOT NULL,
  ALTER COLUMN "maxDurationSeconds" SET NOT NULL,
  ALTER COLUMN "plannedDurationSeconds" SET NOT NULL,
  ALTER COLUMN "shotCount" SET NOT NULL;

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sceneOrder" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "indexInScene" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "camera" TEXT NOT NULL,
    "framing" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "visualPrompt" TEXT NOT NULL,
    "transition" TEXT NOT NULL DEFAULT 'cut',
    "locationId" TEXT NOT NULL,
    "status" "SceneStatus" NOT NULL,
    "keyframeUrl" TEXT,
    "keyframeRequestId" TEXT,
    "keyframeStatusUrl" TEXT,
    "keyframeResponseUrl" TEXT,
    "keyframeCancelUrl" TEXT,
    "keyframeError" TEXT,
    "videoUrl" TEXT,
    "videoRequestId" TEXT,
    "videoStatusUrl" TEXT,
    "videoResponseUrl" TEXT,
    "videoCancelUrl" TEXT,
    "videoError" TEXT,
    "keyframeAttempts" INTEGER NOT NULL DEFAULT 0,
    "videoAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shot_storyId_status_idx" ON "Shot"("storyId", "status");

-- CreateIndex
CREATE INDEX "Shot_sceneId_order_idx" ON "Shot"("sceneId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Shot_storyId_order_key" ON "Shot"("storyId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Shot_sceneId_indexInScene_key" ON "Shot"("sceneId", "indexInScene");

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill one legacy shot per 007 scene. Copy provider state; never move it.
INSERT INTO "Shot" (
  "id", "storyId", "sceneId", "sceneOrder", "order", "indexInScene",
  "durationSeconds", "camera", "framing", "subject", "action", "visualPrompt",
  "transition", "locationId", "status",
  "keyframeUrl", "keyframeRequestId", "keyframeStatusUrl", "keyframeResponseUrl",
  "keyframeCancelUrl", "keyframeError",
  "videoUrl", "videoRequestId", "videoStatusUrl", "videoResponseUrl",
  "videoCancelUrl", "videoError", "keyframeAttempts", "videoAttempts",
  "createdAt", "updatedAt"
)
SELECT
  'shot_' || s."id", s."storyId", s."id", s."order", s."order", 1,
  6, 'wide', 'establishing', 'Plano heredado', COALESCE(s."visualPrompt", s."narration"),
  COALESCE(s."visualPrompt", s."narration"), 'cut', 'legacy-location', s."status",
  s."keyframeUrl", s."keyframeRequestId", s."keyframeStatusUrl", s."keyframeResponseUrl",
  s."keyframeCancelUrl", s."keyframeError",
  s."videoUrl", s."videoRequestId", s."videoStatusUrl", s."videoResponseUrl",
  s."videoCancelUrl", s."videoError", s."keyframeAttempts", s."videoAttempts",
  s."createdAt", s."updatedAt"
FROM "Scene" s;
