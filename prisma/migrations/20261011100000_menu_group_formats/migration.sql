-- Formati del gruppo (es. birre alla spina 0,2 l · 0,4 l · Maß 1 l): i nomi delle
-- colonne sul gruppo, i prezzi restano nelle varianti delle voci. Null = nessuno.
ALTER TABLE "MenuGroup" ADD COLUMN "formats" JSONB;
