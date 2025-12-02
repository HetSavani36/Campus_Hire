/*
  Warnings:

  - Made the column `mentorApproval` on table `Application` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Application" ALTER COLUMN "mentorApproval" SET NOT NULL,
ALTER COLUMN "mentorApproval" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "collabNameShowUp" BOOLEAN NOT NULL DEFAULT false;
