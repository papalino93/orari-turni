// Versione dell'app: numero di package.json (da aumentare a ogni rilascio) e,
// in produzione, i primi 7 caratteri del commit. Puro: usabile anche nel client.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";

export const VERSION_LABEL = `v${APP_VERSION}${BUILD_SHA ? ` · ${BUILD_SHA}` : ""}`;
