export function Ornament({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-[7px]" aria-hidden>
      <div className="h-px w-7" style={{ background: color }} />
      <div className="h-[5px] w-[5px] rotate-45 border" style={{ borderColor: color }} />
      <div className="h-[3px] w-[3px] rotate-45" style={{ background: color }} />
      <div className="h-[5px] w-[5px] rotate-45 border" style={{ borderColor: color }} />
      <div className="h-px w-7" style={{ background: color }} />
    </div>
  );
}
