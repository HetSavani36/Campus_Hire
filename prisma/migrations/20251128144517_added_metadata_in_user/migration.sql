-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasCompletedProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB;
