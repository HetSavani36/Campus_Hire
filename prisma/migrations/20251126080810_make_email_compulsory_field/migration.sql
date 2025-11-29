/*
  Warnings:

  - Made the column `email` on table `College` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "College" ALTER COLUMN "email" SET NOT NULL;
