-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoryStatus" ADD VALUE 'QC';
ALTER TYPE "StoryStatus" ADD VALUE 'WAITING_QC';

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "qcCheckedAt" TIMESTAMP(3),
ADD COLUMN     "qcJson" JSONB;
