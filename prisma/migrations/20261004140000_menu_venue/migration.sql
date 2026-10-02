-- Copertina del menù (foto sostituibile), orari e contatti del locale.
CREATE TABLE "MenuHeroImage" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuHeroImage_pkey" PRIMARY KEY ("id")
);

-- Valori di partenza (impostazioni JSON): orari della scheda Google e contatti
-- del locale. Il titolare li modifica dalla gestione.
INSERT INTO "MenuSetting" ("id", "value") VALUES
  ('hours', '{"showStatus":true,"weekly":[[{"open":"17:00","close":"21:30"}],[{"open":"17:00","close":"21:30"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:00"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:30"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:00"}],[{"open":"10:00","close":"13:00"},{"open":"16:30","close":"22:00"}],[{"open":"16:30","close":"21:00"}]],"exceptions":[]}'),
  ('contacts', '{"phone":"338 327 7053","whatsappMessage":"Ciao, vorrei prenotare un tavolo per…","address":"Via dei Rossi 53/C, 50018 Scandicci FI","instagram":"https://www.instagram.com/langolo.del.vino_enoteca/","review":"https://share.google/ads9ad7vXNVdN2B4t"}'),
  ('hero', '{"title":"Carta dei vini\ne Menù"}')
ON CONFLICT ("id") DO NOTHING;
