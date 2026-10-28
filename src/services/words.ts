export type SavedWord = {
  id: string;
  word: string;
  translation: string;
  lectureTitle: string;
  time: number;
  createdAt: number;
};

const KEY = 'duetto_words';
const CAP = 300;

function storage(): chrome.storage.LocalStorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  return chrome.storage.local;
}

export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function wordsToCsv(words: SavedWord[]): string {
  const lines = ['word,translation,lecture,time_sec,created_at'];
  for (const word of words) {
    lines.push(
      [
        csvCell(word.word),
        csvCell(word.translation),
        csvCell(word.lectureTitle),
        csvCell(String(Math.floor(word.time))),
        csvCell(new Date(word.createdAt).toISOString()),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export async function getWords(): Promise<SavedWord[]> {
  const area = storage();
  if (!area) return [];
  const bag = await area.get(KEY);
  const list = bag[KEY];
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is SavedWord => !!item && typeof item.word === 'string' && typeof item.translation === 'string');
}

export async function addWord(word: SavedWord): Promise<SavedWord[]> {
  const clean = word.word.trim();
  const translation = word.translation.trim();
  if (!clean || !translation) return getWords();
  const prev = await getWords();
  const key = clean.toLowerCase();
  const next = [{ ...word, word: clean, translation }, ...prev.filter((item) => item.word.toLowerCase() !== key)].slice(0, CAP);
  const area = storage();
  if (area) await area.set({ [KEY]: next });
  return next;
}
