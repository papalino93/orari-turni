-- Messaggio WhatsApp precompilato: «Ciao! Vorrei prenotare un tavolo per » (il
-- sito aggiunge lo spazio finale, così il cliente continua a scrivere). Cambia
-- solo se è ancora quello di partenza: un testo scritto dalla gestione resta.
UPDATE "MenuSetting"
SET "value" = replace(replace("value", 'Ciao, vorrei prenotare un tavolo per…', 'Ciao! Vorrei prenotare un tavolo per'), 'Ciao, vorrei prenotare un tavolo per…', 'Ciao! Vorrei prenotare un tavolo per')
WHERE "id" = 'contacts';
