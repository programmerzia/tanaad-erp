/** UUID v7-ish: time-ordered, unique enough for a client-side demo. */
export function uuid7(): string {
  const t = Date.now().toString(16).padStart(12, '0');
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-7${r().slice(1)}-${r()}-${r()}${r()}${r()}`.slice(0, 36);
}
export const nowIso = () => new Date().toISOString();
