# Guida alla gestione del menù (PDF)

Il PDF `docs/guida/Guida-gestione-menu.pdf` si scarica dalla gestione del menù
(pulsante **Guida**, route `/gestione-menu/guida`, solo per chi gestisce il menù).

**Va rigenerato a ogni miglioramento della gestione o del menù**: testi in
`build.mjs` (una sezione per pagina, guida passo passo e domande frequenti),
schermate negli script `shots*.mjs`. Aggiorna anche la versione in copertina e
nella domanda «Dove trovo il numero di versione?».

## Come si rigenera

1. Database locale di prova e server come per i test in `scripts/menu-e2e`:
   `next dev -p 3100` con `DATABASE_URL` del database di prova.
2. `E2E_ADMIN_PASSWORD=… E2E_EMPLOYEE_PASSWORD=… bash scripts/guida/genera.sh`
   (serve anche `python3` con `pymupdf`: `pip install pymupdf`).

`setup.mjs` ricrea i dati di esempio (eventi con le locandine vere in
`assets/`, piatto e vino del giorno, abbinamenti, statistiche di esempio):
**cancella i dati del database di prova**, mai usarlo su quello vero.

## Perché il PDF è fatto di immagini

Ogni pagina viene fotografata ad alta risoluzione (`topdf3.mjs`) e poi unita
(`unisci.py`). Un PDF «normale» stampato dal browser mostra ombre e
trasparenze in modo diverso nei vari visualizzatori: su iPhone le ombre dei
telefoni ruotati uscivano come riquadri grigi. Con le immagini la guida è
identica ovunque.

Le schermate della gestione sono prese da computer (1680×1050, tema chiaro)
dentro un MacBook disegnato: il titolare gestisce il menù soprattutto dal
computer. Quelle del menù dei clienti restano da telefono.
