/*
  Warnings:

  - The `mentorApproval` column on the `Application` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "mentorApproval",
ADD COLUMN     "mentorApproval" "ApprovalStatus";
