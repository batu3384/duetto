export function noteSaveFeedback(keptImage: boolean, triedImage: boolean): string {
  if (keptImage) return 'Not + kare kaydedildi';
  if (triedImage) return 'Not kaydedildi (kare sığmadı)';
  return 'Not kaydedildi (kare alınamadı)';
}
