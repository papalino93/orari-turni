-- Eventi e annunci ("In evidenza"): pagine promozionali a tempo con locandina,
-- menù speciale per gli eventi (una MenuSection collegata) e formati con prezzo
-- per le voci (MenuItem.variants).

-- CreateEnum
CREATE TYPE "MenuPromoKind" AS ENUM ('NOTICE', 'EVENT');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "variants" JSONB;

-- AlterTable
ALTER TABLE "MenuSection" ADD COLUMN     "promoId" TEXT;

-- CreateTable
CREATE TABLE "MenuPromo" (
    "id" TEXT NOT NULL,
    "kind" "MenuPromoKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "label" TEXT,
    "body" TEXT,
    "showFrom" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "imageUpdatedAt" TIMESTAMP(3),
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuPromoImage" (
    "promoId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuPromoImage_pkey" PRIMARY KEY ("promoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuPromo_slug_key" ON "MenuPromo"("slug");

-- CreateIndex
CREATE INDEX "MenuPromo_endDate_idx" ON "MenuPromo"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "MenuSection_promoId_key" ON "MenuSection"("promoId");

-- AddForeignKey
ALTER TABLE "MenuSection" ADD CONSTRAINT "MenuSection_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "MenuPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuPromoImage" ADD CONSTRAINT "MenuPromoImage_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "MenuPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

