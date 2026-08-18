"use client";

// Ultima rete di sicurezza: scatta solo se l'errore avviene nel root layout
// stesso (fuori da qualunque altro error boundary, incluso quello sotto
// (app)/). Deve rifornire da sé <html>/<body>, perché sostituisce l'intero
// layout radice — niente import da globals.css o dal resto dell'app, che
// potrebbe essere proprio la causa del problema.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body style={{ background: "#0c0b0d", color: "#f3efe9", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Qualcosa è andato storto</h1>
          <p style={{ fontSize: "0.875rem", color: "#a39d9a", maxWidth: 360 }}>
            Si è verificato un errore imprevisto. Riprova a caricare la pagina.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: "0.5rem",
              background: "#8a2740",
              color: "#fdf2f4",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  );
}
