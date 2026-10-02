// "1 turno" / "3 turni": evita i plurali sbagliati ("1 turni") nei messaggi.
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
