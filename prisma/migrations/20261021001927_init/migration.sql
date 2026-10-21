-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('PLANNING', 'GENERATING_KEYFRAMES', 'WAITING_APPROVAL', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'ASSEMBLING', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('PENDING', 'KEYFRAME_QUEUED', 'KEYFRAME_RUNNING', 'KEYFRAME_READY', 'KEYFRAME_FAILED', 'VIDEO_QUEUED', 'VIDEO_RUNNING', 'VIDEO_READY', 'VIDEO_FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "StoryStatus" NOT NULL,
    "premise" TEXT NOT NULL,
    "title" TEXT,
    "logline" TEXT,
    "referenceUrl" TEXT,
    "referenceExpiresAt" TIMESTAMP(3),
    "preset" TEXT NOT NULL,
    "sceneCount" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "planJson" JSONB,
    "finalVideoUrl" TEXT,
    "finalVideoExpiresAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "visualPrompt" TEXT NOT NULL,
    "narration" TEXT NOT NULL,
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

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_sessionId_idx" ON "Story"("sessionId");

-- CreateIndex
CREATE INDEX "Story_sessionId_status_idx" ON "Story"("sessionId", "status");

-- CreateIndex
CREATE INDEX "Story_status_leaseUntil_idx" ON "Story"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Story_sessionId_idempotencyKey_key" ON "Story"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Scene_storyId_status_idx" ON "Scene"("storyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_storyId_order_key" ON "Scene"("storyId", "order");

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
