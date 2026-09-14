import { LectureNote } from '../types';

const NOTES_KEY = 'duetto_notes';
const LEGACY_NOTES_KEY = 'dualis_notes';

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function getNotes(): Promise<LectureNote[]> {
  if (!hasStorage()) return [];
  const result = await chrome.storage.local.get([NOTES_KEY, LEGACY_NOTES_KEY]);
  const notes = result[NOTES_KEY] ?? result[LEGACY_NOTES_KEY];
  const list = Array.isArray(notes) ? (notes as LectureNote[]) : [];
  if (list.length && !result[NOTES_KEY] && result[LEGACY_NOTES_KEY]) {
    await chrome.storage.local.set({ [NOTES_KEY]: list });
    await chrome.storage.local.remove(LEGACY_NOTES_KEY);
  }
  return list;
}

export async function addNote(note: LectureNote): Promise<LectureNote[]> {
  const notes = await getNotes();
  const next = [note, ...notes].slice(0, 200);
  if (hasStorage()) {
    try {
      await chrome.storage.local.set({ [NOTES_KEY]: next });
      await chrome.storage.local.remove(LEGACY_NOTES_KEY);
    } catch (err) {
      if (note.imageDataUrl) {
        const fallback = [{ ...note, imageDataUrl: undefined }, ...notes].slice(0, 200);
        await chrome.storage.local.set({ [NOTES_KEY]: fallback });
        await chrome.storage.local.remove(LEGACY_NOTES_KEY);
        return fallback;
      }
      throw err;
    }
  }
  return next;
}

export async function deleteNote(id: string): Promise<LectureNote[]> {
  const next = (await getNotes()).filter((n) => n.id !== id);
  if (hasStorage()) {
    await chrome.storage.local.set({ [NOTES_KEY]: next });
    await chrome.storage.local.remove(LEGACY_NOTES_KEY);
  }
  return next;
}

export function notesToMarkdown(notes: LectureNote[]): string {
  const lines = ['# Duetto notları', ''];
  for (const note of notes) {
    const mm = Math.floor(note.time / 60);
    const ss = Math.floor(note.time % 60)
      .toString()
      .padStart(2, '0');
    lines.push(`## ${note.lectureTitle} (${mm}:${ss})`);
    lines.push(`*${note.courseTitle}*`);
    lines.push('');
    if (note.sourceText) lines.push(note.sourceText);
    if (note.translation) lines.push(note.translation);
    lines.push('');
  }
  return lines.join('\n');
}
