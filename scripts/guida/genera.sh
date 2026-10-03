#!/usr/bin/env bash
# Rigenera la guida PDF della gestione del menù (docs/guida/Guida-gestione-menu.pdf).
# Serve: il database locale di prova e `next dev -p 3100` acceso, come per i test
# in scripts/menu-e2e (vedi LEGGIMI.md). Cancella e ricrea i dati di esempio.
set -euo pipefail
G="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$G/../.." && pwd)"
: "${E2E_ADMIN_PASSWORD:?imposta E2E_ADMIN_PASSWORD}"
: "${E2E_EMPLOYEE_PASSWORD:?imposta E2E_EMPLOYEE_PASSWORD}"
export CHROME_PATH="${CHROME_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
cd "$G"
node setup.mjs
node shots.mjs
node shots-guide.mjs
node shots-new.mjs
node shots-mac.mjs
cd "$ROOT/.tmp-guida"
node "$G/tojpg.mjs"
node "$G/build.mjs"
node "$G/topdf3.mjs"
python3 "$G/unisci.py" "$ROOT/docs/guida/Guida-gestione-menu.pdf" "$ROOT/.tmp-guida"
echo "Guida pronta: docs/guida/Guida-gestione-menu.pdf (ricordati di guardarla pagina per pagina)"
