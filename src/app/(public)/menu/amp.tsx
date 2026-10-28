// Nei titoli in corsivo la «&» del Cormorant è tutta svolazzi e si legge male: la
// mettiamo dritta (stesso carattere), es. «Caviale & Tartufo bianco», «Pinsa Crudo & Rucola».
export function Amp({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split("&");
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && <span className={`not-italic ${className}`}>&amp;</span>}
      {part}
    </span>
  ));
}
