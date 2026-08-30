# Duetto Translation Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Duetto use the same trustworthy English caption source as Udemy, prevent stale or cross-request translations, reduce Gemini quota waste, and expose actionable caption errors.

**Architecture:** Keep the existing MV3 pipeline. Add one pure caption-track selection/provenance layer, bind transcript cache entries to that source fingerprint, enforce request identity at every response boundary, and make translation demand-driven. Reuse existing storage, VTT parser, and overlay toast mechanisms.

**Tech Stack:** TypeScript, Chrome MV3 APIs, WebVTT/TextTrack, React/Tailwind popup, Gemini REST API.

**Spec:** Codebase audit findings M1–M4, m1–m4 and the user report that Duetto's English caption differs from Udemy native captions.

## Global Constraints

- Do not add dependencies.
- Do not send Gemini API keys to content scripts or page DOM.
- Do not translate when dual subtitles are disabled, source and target languages match, or no key is configured.
- Never apply a translation response to a different lecture, request, tab, or source track.
- An ambiguous source track must fail visibly instead of selecting `validTracks[0]`.
- Existing transcript records without source provenance are not trusted for automatic reuse.
- Every non-trivial behavior change leaves a runnable check in the repository.

---

### Task 1: Add deterministic caption-track selection

**Files:**
- Modify: `src/services/vttParser.ts`
- Modify: `src/content/subtitleManager.ts`
- Test: `src/services/vttParser.check.ts`

**Interfaces:**
- Produce `selectPreferredCaptionTrack<T extends CaptionTrackLike>(tracks: T[], sourceLang: string): T | null`.
- `CaptionTrackLike` contains optional `language`, `label`, and `mode`.
- Selection order: matching `showing` track, matching non-auto track, matching any track; return `null` when no source match exists.

- [ ] **Step 1: Write failing checks** for a showing English track beating a non-showing manual track, a manual English track beating an auto-generated English track when neither is showing, and no fallback to Turkish/unknown tracks.
- [ ] **Step 2: Run `npm run check` and confirm the new selector checks fail before implementation.
- [ ] **Step 3: Implement the pure selector beside existing `trackMatchesSource`; preserve existing label matching.
- [ ] **Step 4: Replace `validTracks.find(...)/validTracks[0]` in `extractAllCues` with the selector.
- [ ] **Step 5: Remove arbitrary `<track>` fallback when no matching source track exists; only use an explicit `srclang` match.
- [ ] **Step 6: Run `npm run check` and `npm run build`.

### Task 2: Bind cache to actual caption source

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/db.ts`
- Modify: `src/content/subtitleManager.ts`
- Test: `src/services/storage.check.ts` or `src/services/vttParser.check.ts`

**Interfaces:**
- Add optional `sourceFingerprint?: string` to `CourseTranscript`.
- `transcriptStorageId` remains backward-compatible for search/list data; automatic reuse requires matching `sourceFingerprint`.
- Add a pure `captionSourceFingerprint(track: CaptionTrackLike | null, url?: string): string` helper using normalized language, label, mode, and URL.

- [ ] **Step 1: Add checks proving two source labels/URLs produce different fingerprints and missing provenance is rejected for automatic reuse.
- [ ] **Step 2: Run the focused check and confirm failure.
- [ ] **Step 3: Add fingerprint type/helper and capture selected TextTrack or explicit `<track>` URL during extraction.
- [ ] **Step 4: Store fingerprint on `SubtitleManager` and in every saved transcript.
- [ ] **Step 5: Require current fingerprint equality before loading cached cues; otherwise extract fresh source.
- [ ] **Step 6: Keep legacy records available to Notes search but never use them as active subtitle source.
- [ ] **Step 7: Run `npm run check` and `npm run build`.

### Task 3: Enforce lecture/request identity and cancellation

**Files:**
- Modify: `src/content/subtitleManager.ts`
- Modify: `src/content/index.ts`
- Modify: `src/background/index.ts`
- Modify: `src/services/translator/gemini.ts`
- Test: `src/services/vttParser.check.ts`

**Interfaces:**
- Every translation response carries and validates `lectureId`, `requestId`, and tab ownership.
- `SubtitleManager.applyTranslationPatches` rejects a stale `requestId`.
- Background rest abort state is keyed by tab ID, not global.

- [ ] **Step 1: Add a pure stale-response check covering old request IDs and different lecture IDs.
- [ ] **Step 2: Run the focused check and confirm failure.
- [ ] **Step 3: Pass request metadata through `mergeTranslated` and `applyTranslationPatches`.
- [ ] **Step 4: Reject stale direct responses before merging.
- [ ] **Step 5: Replace global `restAbort` with a `Map<number, AbortController>` and abort only the same tab's rest request when a live request arrives.
- [ ] **Step 6: Abort/reset pending translation state when a new lecture/source is loaded.
- [ ] **Step 7: Remove duplicate language-swap retrigger if storage change already reloads captions.
- [ ] **Step 8: Run `npm run check` and `npm run build`.

### Task 4: Make Gemini usage demand-driven and quota-safe

**Files:**
- Modify: `src/content/subtitleManager.ts`
- Modify: `src/services/translator/gemini.ts`
- Modify: `src/background/index.ts`
- Modify: `src/content/index.ts`
- Test: `src/services/translator/gemini.check.ts`

**Interfaces:**
- Translation starts only when dual subtitles are enabled, languages differ, and a configured key exists.
- Initial load translates no cues while paused; playback translates only the live window.
- 429/resource exhaustion stops retries and publishes a cooldown error.

- [ ] **Step 1: Add checks that retry policy does not retry quota errors and that a disabled translation gate returns no work.
- [ ] **Step 2: Run the focused check and confirm failure.
- [ ] **Step 3: Add a shared quota-error predicate and bounded cooldown without adding a dependency.
- [ ] **Step 4: Stop the second Gemini attempt for 429/RESOURCE_EXHAUSTED.
- [ ] **Step 5: Gate `kickTranslate` and `ensureLive` on `dualSubtitlesEnabled`.
- [ ] **Step 6: Remove eager full-rest translation from initial subtitle load; keep playback-driven live translation only.
- [ ] **Step 7: Ensure `TRIGGER_TRANSLATE` cannot bypass the same gate.
- [ ] **Step 8: Run `npm run check` and `npm run build`.

### Task 5: Make source and translation state visible in the overlay

**Files:**
- Modify: `src/content/subtitleManager.ts`
- Modify: `src/content/overlay/uiRenderer.ts`
- Modify: `src/content/overlay/shadowRoot.ts` only if existing toast styling cannot support the message
- Test: `src/services/vttParser.check.ts`

**Interfaces:**
- Expose source status: selected label/language, source confidence, or explicit failure.
- User-facing failure includes recovery action text: refresh captions or clear stale data.

- [ ] **Step 1: Add a pure status-message check for ambiguous/missing source.
- [ ] **Step 2: Run the focused check and confirm failure.
- [ ] **Step 3: Store selected source metadata in `SubtitleManager`.
- [ ] **Step 4: Render source mismatch/uncertain-source state near the caption with `role="status"` or `role="alert"` as appropriate.
- [ ] **Step 5: Keep loading/quota errors distinct from source errors; never imply Gemini caused source mismatch.
- [ ] **Step 6: Run `npm run check` and `npm run build`.

### Task 6: Add regression coverage and audit documentation

**Files:**
- Modify: `src/services/vttParser.check.ts`
- Modify: `src/services/translator/gemini.check.ts`
- Modify: `wiki/Troubleshooting.md`
- Modify: `wiki/Architecture.md`
- Modify: `README.md` only if cache reset instructions are absent

- [ ] **Step 1: Add regression cases for track preference, no arbitrary fallback, cache provenance, stale request rejection, disabled translation, and 429 no-retry.
- [ ] **Step 2: Run `npm run check`.
- [ ] **Step 3: Run `npm run build`.
- [ ] **Step 4: Verify generated extension output contains the updated content and background bundles.
- [ ] **Step 5: Run every command listed in `GATES.md` if that file exists; otherwise record that no repository gate file exists.
- [ ] **Step 6: Review `git diff` for scope, secret exposure, and orphaned imports.
