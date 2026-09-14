export function isDuettoShortcutKey(key: string, ctrl = false, meta = false, alt = false): boolean {
  if (ctrl || meta || alt) return false;
  const k = key.toLowerCase();
  return k === 's' || k === 'd' || k === 'p' || k === 'j' || k === 'l' || key === '[' || key === ']';
}
