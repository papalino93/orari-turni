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

Le schermate della gestione del PDF sono prese da computer (1680×1050, tema chiaro)
dentro un MacBook disegnato: il titolare gestisce il menù soprattutto dal
computer. Quelle del menù dei clienti restano da telefono.

## La guida animata (video)

Oltre al PDF c'è `docs/guida/Guida-gestione-menu.mp4`: un video verticale (1080×1920, circa
tre minuti) in stile «motion graphics»: dodici capitoli, ognuno con il suo colore d'accento su
base vino, barra di avanzamento, introduzione e chiusura con la versione. L'interfaccia della
gestione da **telefono** (tema chiaro) è ridisegnata in HTML e si muove (tocchi, righe che
scorrono, finestre); il **tablet** e il **computer** (tema scuro, come si usano davvero) sono
schermate vere dentro una cornice, con camera che si avvicina e riquadri sui pulsanti; il menù
dei clienti è fotografato da telefono (calice che si riempie scorrendo, ricerca, abbinamenti,
«Prenota» che apre WhatsApp, calendario, recensioni). Si guarda dal pulsante **Guida (video)**
in «Strumenti» (route `/gestione-menu/guida/video`, solo per chi gestisce il menù, con
supporto a «Range» perché su iPhone parta).

**Va rigenerato insieme al PDF a ogni miglioramento della gestione.**

1. Database di prova e server come per i test, e ffmpeg (`pip install imageio-ffmpeg`, oppure
   la variabile `FFMPEG`).
2. `E2E_ADMIN_PASSWORD=… E2E_EMPLOYEE_PASSWORD=… bash scripts/guida/genera-video.sh`
   (cancella e ricrea i dati di esempio, come per il PDF).

Pezzi: `video-shots.mjs` (fotografa le schermate in alta risoluzione e i riquadri da toccare,
una «sessione» per dispositivo: `ONLY=p,t,l,lw,c,c2,m,ms` rifà solo quelle; `m` e `ms` sono il
computer, `ms` le statistiche), `video-build.mjs` (mette insieme pagina, GSAP e dati in
`video.html`), `video-scenes.js` (**qui si cambiano capitoli, testi, tempi e animazioni**: una
sola timeline GSAP in pausa, `window.render(t)`), `video.css` (stile) e `video-render.mjs`
(un fotogramma ogni 1/30 di secondo, con due browser in parallelo → pezzi MP4 uniti; con
`--stills 5,20,40` salva solo alcune immagini per controllare). GSAP è in `vendor`, i caratteri
(Cormorant Garamond, Jost, Geist) in `assets/fonts`: il video non ha bisogno di rete.
Il computer è fotografato a 800×500 e mostrato su uno schermo 1280×800 di proposito: così i
testi si leggono. Regole imparate per la timeline: niente `immediateRender:false`, niente
trasformazioni CSS sugli elementi animati (si usano `gsap.set`), solo `fromTo`/`to`.

Prima di pubblicarlo guarda **tutte le scene** come immagini (`--stills`): testi e pulsanti
con gli stessi nomi del sito, niente testo tagliato, tocchi sul pulsante giusto, versione
nell'introduzione e nella chiusura. Il peso deve restare sotto i 12 MB (`CRF=23 node video-render.mjs` per alleggerirlo).
