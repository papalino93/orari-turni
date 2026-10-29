-- «Può contenere tracce di…» per voce: colonna nuova con valore vuoto, il codice attuale la ignora.
ALTER TABLE "MenuItem" ADD COLUMN "allergenTraces" TEXT[] DEFAULT ARRAY[]::TEXT[];
