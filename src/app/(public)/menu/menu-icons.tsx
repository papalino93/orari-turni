// Calice e bottiglia disegnati a tratto: in testa alle colonne dei prezzi, negli abbinamenti e nei consigli della casa.
export function GlassIcon({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden width={small ? 12 : 15} height={small ? 16 : 20} viewBox="0 0 24 32" fill="none" stroke="#6B1020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2h14c0 8-3 13-7 13S5 10 5 2z" />
      <path d="M12 15v13" />
      <path d="M7 30h10" />
    </svg>
  );
}

export function BottleIcon({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden width={small ? 8 : 11} height={small ? 16 : 22} viewBox="0 0 16 32" fill="none" stroke="#6B1020" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 1.5h4v7c0 1.5 4 3 4 7.5v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V16c0-4.5 4-6 4-7.5z" />
      <path d="M2 19h12M2 25h12" />
    </svg>
  );
}
