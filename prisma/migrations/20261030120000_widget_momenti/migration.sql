-- Widget nuovi: «Anteprima menù» (menu) e «Oggi fuori menù» (fuorimenu) dei dipendenti diventano
-- «Da dire ai clienti» (clienti). Solo dati, nessun cambio di tabelle.
UPDATE "Employee"
SET "widgets" = (
  SELECT COALESCE(array_agg(DISTINCT x), '{}')
  FROM unnest(array_replace(array_replace("widgets", 'menu', 'clienti'), 'fuorimenu', 'clienti')) AS x
)
WHERE "widgets" && ARRAY['menu', 'fuorimenu']::text[];
