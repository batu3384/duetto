import { playerHook } from './playerHook';
import { subtitleManager } from './subtitleManager';
import { shadowOverlay } from './overlay/shadowRoot';
import { addNote } from '../services/notes';
import { noteSaveFeedback } from '../services/noteSaveFeedback';

export async function captureCurrentNote(): Promise<boolean> {
  const meta = subtitleManager.getMetadata();
  const cue = subtitleManager.getCurrentCue();
  const time = playerHook.getCurrentTime();
  const imageDataUrl = playerHook.captureFrame();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const saved = await addNote({
      id,
      lectureId: meta.lectureId,
      courseId: meta.courseId,
      courseTitle: meta.courseTitle,
      lectureTitle: meta.lectureTitle,
      time,
      sourceText: cue?.text || '',
      translation: cue?.translation,
      imageDataUrl,
      createdAt: Date.now(),
    });
    const keptImage = !!saved.find((note) => note.id === id)?.imageDataUrl;
    shadowOverlay.showToast(noteSaveFeedback(keptImage, !!imageDataUrl));
  } catch {
    shadowOverlay.showToast('Not kaydedilemedi. Depolamayı kontrol et.');
    return false;
  }

  return true;
}
