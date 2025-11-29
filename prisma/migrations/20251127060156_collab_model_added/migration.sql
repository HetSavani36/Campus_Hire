/*
  Warnings:

  - Added the required column `rollNo` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Made the column `refreshToken` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "CollabStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "rollNo" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "refreshToken" SET NOT NULL,
ALTER COLUMN "refreshToken" SET DEFAULT '';

-- CreateTable
CREATE TABLE "Collab" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CollabStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collab_collegeId_companyId_key" ON "Collab"("collegeId", "companyId");

-- AddForeignKey
ALTER TABLE "Collab" ADD CONSTRAINT "Collab_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collab" ADD CONSTRAINT "Collab_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
