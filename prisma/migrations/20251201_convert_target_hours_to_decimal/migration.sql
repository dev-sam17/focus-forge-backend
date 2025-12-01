-- AlterTable
-- Convert targetHours from INTEGER to DECIMAL(5,2) to support fractional hours
ALTER TABLE "Tracker" ALTER COLUMN "targetHours" SET DATA TYPE DECIMAL(5,2);
