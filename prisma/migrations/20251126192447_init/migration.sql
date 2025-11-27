-- CreateTable
CREATE TABLE "Song" (
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

-- CreateIndex
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");
