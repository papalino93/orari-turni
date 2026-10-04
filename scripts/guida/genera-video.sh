#!/usr/bin/env bash
# Rigenera la guida animata (docs/guida/Guida-gestione-menu.mp4): un video verticale 720×1280,
# 30 fotogrammi al secondo, con le schermate vere della gestione (telefono, tablet, computer).
# Serve: il database locale di prova e `next dev -p 3100` accesi, come per i test in
# scripts/menu-e2e (vedi LEGGIMI.md), e ffmpeg (`pip install imageio-ffmpeg`, oppure FFMPEG=…).
# Cancella e ricrea i dati di esempio. Il numero di versione nel video è quello di package.json.
set -euo pipefail
G="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$G/../.." && pwd)"
: "${E2E_ADMIN_PASSWORD:?imposta E2E_ADMIN_PASSWORD}"
: "${E2E_EMPLOYEE_PASSWORD:?imposta E2E_EMPLOYEE_PASSWORD}"
export CHROME_PATH="${CHROME_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
cd "$G"
node setup.mjs
node video-shots.mjs
node video-build.mjs
node video-render.mjs "$ROOT/docs/guida/Guida-gestione-menu.mp4"
echo "Video pronto: docs/guida/Guida-gestione-menu.mp4 (guardalo fotogramma per fotogramma: video-render.mjs --stills 5,20,40…)"
