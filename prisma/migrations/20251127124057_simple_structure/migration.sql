/*
  Warnings:

  - You are about to drop the `LyricLine` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `original` to the `Song` table without a default value. This is not possible if the table is not empty.
  - Added the required column `romanized` to the `Song` table without a default value. This is not possible if the table is not empty.
  - Added the required column `translationEn` to the `Song` table without a default value. This is not possible if the table is not empty.
  - Added the required column `translationEs` to the `Song` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "LyricLine_songId_lineNumber_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LyricLine";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Song" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "romanized" TEXT NOT NULL,
    "translationEn" TEXT NOT NULL,
    "translationEs" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Song" ("artist", "contentHash", "createdAt", "id", "slug", "title") SELECT "artist", "contentHash", "createdAt", "id", "slug", "title" FROM "Song";
DROP TABLE "Song";
ALTER TABLE "new_Song" RENAME TO "Song";
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
