"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmployeeAvatar } from "@/components/avatar";
import { useToast, runWithToast } from "@/components/toast";
import { loadImageElement, PhotoError } from "@/lib/photo";
import { deleteEmployeePhoto, saveEmployeePhoto } from "./actions";
import { PhotoCropper } from "./photo-cropper";

export function PhotoEditor({
  employee,
  onClose,
}: {
  employee: { id: string; name: string; photoVersion: string | null; role: "EMPLOYEE" | "OWNER" };
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Immagine appena scelta, in attesa di essere ritagliata dall'utente
  // (trascinamento + zoom) prima di diventare la foto finale da salvare.
  const [rawImage, setRawImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  async function onPick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("Immagine troppo grande (max 15 MB). Scegline una più leggera.");
      return;
    }
    try {
      setRawImage(await loadImageElement(file));
    } catch (err) {
      setError(err instanceof PhotoError ? err.message : "Impossibile elaborare l'immagine.");
    }
  }

  function onCropConfirmed(file: File) {
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    setRawImage(null);
  }

  function save() {
    if (!pendingFile) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("employeeId", employee.id);
      fd.set("photo", pendingFile);
      const ok = await runWithToast(toast, () => saveEmployeePhoto(fd), "Foto aggiornata");
      if (ok !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  function removePhoto() {
    startTransition(async () => {
      const ok = await runWithToast(toast, () => deleteEmployeePhoto(employee.id), "Foto rimossa");
      if (ok !== null) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl"
      >
        <h2 className="mb-4 text-base font-semibold text-foreground">Foto di {employee.name}</h2>

        {rawImage ? (
          <PhotoCropper image={rawImage} onCancel={() => setRawImage(null)} onConfirm={onCropConfirmed} />
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- anteprima locale da object URL
                <img src={preview} alt="" className="h-28 w-28 rounded-full object-cover ring-1 ring-border" />
              ) : (
                <EmployeeAvatar employee={employee} size="xl" />
              )}
            </div>

            {error && <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={`Carica una foto per ${employee.name}`}
              tabIndex={-1}
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent"
              >
                {employee.photoVersion || preview ? "Scegli un'altra foto" : "Carica una foto"}
              </button>

              {pendingFile && (
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? "Salvataggio…" : "Salva foto"}
                </button>
              )}

              {employee.photoVersion && !pendingFile && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={pending}
                  className="text-xs font-medium text-foreground-muted hover:text-danger disabled:opacity-50"
                >
                  Rimuovi foto
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground"
              >
                Chiudi
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
