/*
  Warnings:

  - You are about to drop the column `original` on the `Song` table. All the data in the column will be lost.
  - You are about to drop the column `romanized` on the `Song` table. All the data in the column will be lost.
  - You are about to drop the column `translationEn` on the `Song` table. All the data in the column will be lost.
  - You are about to drop the column `translationEs` on the `Song` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "LyricLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "songId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "original" TEXT NOT NULL,
    "romanized" TEXT NOT NULL,
    "translationEn" TEXT NOT NULL,
    "translationEs" TEXT NOT NULL,
    CONSTRAINT "LyricLine_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Song" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Song" ("artist", "contentHash", "createdAt", "id", "slug", "title") SELECT "artist", "contentHash", "createdAt", "id", "slug", "title" FROM "Song";
DROP TABLE "Song";
ALTER TABLE "new_Song" RENAME TO "Song";
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LyricLine_songId_lineNumber_idx" ON "LyricLine"("songId", "lineNumber");
