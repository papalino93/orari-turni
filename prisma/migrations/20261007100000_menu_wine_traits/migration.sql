-- Caratteristiche dei vini (vegano, biologico, biodinamico, senza solfiti
-- aggiunti): una colonna nuova, vuota per tutti (stesso tipo di "allergens").
ALTER TABLE "MenuItem" ADD COLUMN "traits" TEXT[] DEFAULT ARRAY[]::TEXT[];
