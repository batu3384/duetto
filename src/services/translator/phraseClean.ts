export function cleanPhraseTranslation(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`«»]+|["'`«»]+$/g, '')
    .split('\n')[0]
    .trim();
}
