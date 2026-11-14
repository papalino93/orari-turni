-- Mail: la rubrica (solo aggiunte, si può rilanciare): contatti, gruppi, a chi è andato ogni invio
-- e il motivo dichiarato al passo 3 dell'invio.
-- AlterTable
ALTER TABLE "MailSend" ADD COLUMN IF NOT EXISTS "basis" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailSendRecipient" (
    "sendId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSendRecipient_pkey" PRIMARY KEY ("sendId","email")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mano',
    "consent" TEXT NOT NULL DEFAULT 'altro',
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MailContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'vino',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailContactGroup" (
    "contactId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailContactGroup_pkey" PRIMARY KEY ("contactId","groupId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailSendRecipient_email_idx" ON "MailSendRecipient"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "MailContact_email_key" ON "MailContact"("email");
CREATE INDEX IF NOT EXISTS "MailContact_deletedAt_idx" ON "MailContact"("deletedAt");
CREATE INDEX IF NOT EXISTS "MailContactGroup_groupId_idx" ON "MailContactGroup"("groupId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MailSendRecipient" ADD CONSTRAINT "MailSendRecipient_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MailContactGroup" ADD CONSTRAINT "MailContactGroup_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MailContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MailContactGroup" ADD CONSTRAINT "MailContactGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MailGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
