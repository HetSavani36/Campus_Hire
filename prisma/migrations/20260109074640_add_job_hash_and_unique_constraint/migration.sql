/*
  Warnings:

  - A unique constraint covering the columns `[companyId,collegeId,jobHash]` on the table `Job` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "jobHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_collegeId_jobHash_key" ON "Job"("companyId", "collegeId", "jobHash");
