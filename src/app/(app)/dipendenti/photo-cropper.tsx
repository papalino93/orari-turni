"use client";

// Ritaglio interattivo della foto profilo: l'utente trascina l'immagine per
// centrarla (es. un volto non al centro dello scatto originale) e usa lo
// zoom per stringere l'inquadratura, invece di subire un ritaglio centrale
// automatico che a volte tagliava male.

import { useMemo, useRef, useState } from "react";
import { cropToSquareJpeg, PhotoError } from "@/lib/photo";

const BOX_SIZE = 260; // px, lato del riquadro di anteprima quadrato
const MAX_ZOOM = 3;

export function PhotoCropper({
  image,
  onCancel,
  onConfirm,
}: {
  image: HTMLImageElement;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const { naturalWidth: w, naturalHeight: h } = image;
  // Scala minima: quella per cui l'immagine copre per intero il riquadro
  // (il lato più corto arriva esattamente a BOX_SIZE) — non deve mai poter
  // scendere sotto, altrimenti si vedrebbe un bordo vuoto nel ritaglio.
  const baseScale = BOX_SIZE / Math.min(w, h);

  const [zoom, setZoom] = useState(1); // moltiplicatore sopra baseScale
  const scale = baseScale * zoom;
  const dispW = w * scale;
  const dispH = h * scale;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const [offset, setOffset] = useState(() => ({
    x: (BOX_SIZE - w * baseScale) / 2,
    y: (BOX_SIZE - h * baseScale) / 2,
  }));

  function clampOffset(o: { x: number; y: number }, dw: number, dh: number) {
    return {
      x: clamp(o.x, BOX_SIZE - dw, 0),
      y: clamp(o.y, BOX_SIZE - dh, 0),
    };
  }

  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }, dispW, dispH));
  }
  function onPointerUp() {
    dragRef.current = null;
    setDragging(false);
  }

  function onZoomChange(newZoom: number) {
    const newScale = baseScale * newZoom;
    const newDispW = w * newScale;
    const newDispH = h * newScale;
    setZoom(newZoom);
    setOffset((prev) => clampOffset(prev, newDispW, newDispH));
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      // La regione visibile nel riquadro, riportata in pixel dell'immagine
      // originale: il riquadro copre [-offset, -offset+BOX_SIZE] in
      // coordinate dell'immagine "a schermo", diviso per la scala corrente
      // per tornare ai pixel sorgente.
      const sSize = BOX_SIZE / scale;
      const sx = clamp(-offset.x / scale, 0, w - sSize);
      const sy = clamp(-offset.y / scale, 0, h - sSize);
      const file = await cropToSquareJpeg(image, { sx, sy, sSize });
      onConfirm(file);
    } catch (err) {
      setError(err instanceof PhotoError ? err.message : "Impossibile elaborare l'immagine.");
    } finally {
      setBusy(false);
    }
  }

  const previewUrl = useMemo(() => image.src, [image]);

  return (
    <div>
      <p className="mb-3 text-xs text-foreground-muted">Trascina per centrare, usa lo zoom per stringere l&apos;inquadratura.</p>

      <div
        className="relative mx-auto overflow-hidden rounded-full border border-border bg-surface-2 touch-none select-none"
        style={{ width: BOX_SIZE, height: BOX_SIZE, cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        aria-label="Trascina per riposizionare la foto nel ritaglio"
        tabIndex={0}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- anteprima interattiva su object URL, trascinata via transform */}
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: dispW,
            height: dispH,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            maxWidth: "none",
          }}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-foreground-muted" aria-hidden>
          −
        </span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          aria-label="Zoom della foto"
          className="flex-1 accent-accent"
        />
        <span className="text-xs text-foreground-muted" aria-hidden>
          +
        </span>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Elaboro…" : "Usa questa foto"}
        </button>
      </div>
    </div>
  );
}
