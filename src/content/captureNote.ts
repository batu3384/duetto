import { playerHook } from './playerHook';
import { subtitleManager } from './subtitleManager';
import { shadowOverlay } from './overlay/shadowRoot';
import { addNote } from '../services/notes';

export async function captureCurrentNote(): Promise<boolean> {
  const meta = subtitleManager.getMetadata();
  const cue = subtitleManager.getCurrentCue();
  const time = playerHook.getCurrentTime();
  const imageDataUrl = playerHook.captureFrame();

  await addNote({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

  shadowOverlay.showToast(imageDataUrl ? 'Not + kare kaydedildi' : 'Not kaydedildi (kare alınamadı)');
  return true;
}
