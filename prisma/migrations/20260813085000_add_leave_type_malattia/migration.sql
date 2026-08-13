-- La malattia non consuma né ferie né permessi: senza un tipo suo finiva
-- inevitabilmente segnata come permesso, falsando i saldi.
-- In una migrazione separata perché l'aggiunta di un valore a un enum ha
-- vincoli propri rispetto alla transazione che avvolge la migrazione.
ALTER TYPE "LeaveType" ADD VALUE 'MALATTIA';
