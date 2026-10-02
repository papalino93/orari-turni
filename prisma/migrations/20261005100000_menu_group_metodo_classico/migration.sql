-- Titolo del gruppo di vini in «Bollicine»: «Metodi classici» → «Metodo classico»
-- (la sezione si chiama già Bollicine). Solo se ha ancora il titolo originale:
-- se il titolare lo ha già cambiato dalla gestione, non si tocca.
UPDATE "MenuGroup" SET "title" = 'Metodo classico' WHERE "id" = 'menu_grp_1_2' AND "title" = 'Metodi classici';
