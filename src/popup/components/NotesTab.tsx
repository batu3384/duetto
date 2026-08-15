import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Trash2 } from 'lucide-react';
import { CourseTranscript, LectureNote, SubtitleCue } from '../../types';
import { deleteNote, getNotes, notesToMarkdown } from '../../services/notes';
import { listTranscripts } from '../../services/db';
import { sendToUdemyTab } from '../sendToTab';

function fmtTime(t: number): string {
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

export const NotesTab: React.FC = () => {
  const [notes, setNotes] = useState<LectureNote[]>([]);
  const [transcripts, setTranscripts] = useState<CourseTranscript[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getNotes().then(setNotes);
    listTranscripts().then((stored) => {
      setTranscripts(stored);
      sendToUdemyTab({ type: 'GET_CUES' }, (res) => {
        const r = res as { cues?: SubtitleCue[]; meta?: { lectureId: string; courseId: string; lectureTitle: string; courseTitle: string } } | undefined;
        if (!r?.cues?.length || !r.meta) return;
        const live: CourseTranscript = {
          id: `live-${r.meta.lectureId}`,
          lectureId: r.meta.lectureId,
          courseId: r.meta.courseId,
          courseTitle: r.meta.courseTitle,
          lectureTitle: r.meta.lectureTitle,
          cues: r.cues,
          language: 'en',
          updatedAt: Date.now(),
        };
        setTranscripts((prev) => [live, ...prev.filter((t) => t.lectureId !== r.meta!.lectureId)]);
      });
    });
  }, []);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as { transcript: CourseTranscript; cue: SubtitleCue }[];
    const out: { transcript: CourseTranscript; cue: SubtitleCue }[] = [];
    for (const transcript of transcripts) {
      for (const cue of transcript.cues) {
        const blob = `${cue.text} ${cue.translation || ''}`.toLowerCase();
        if (blob.includes(q)) out.push({ transcript, cue });
        if (out.length >= 40) return out;
      }
    }
    return out;
  }, [query, transcripts]);

  const exportMd = () => {
    const md = notesToMarkdown(notes);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'duetto-notlar.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2">
        <label htmlFor="tx-search" className="text-xs font-semibold text-zinc-300">
          Transkript ara
        </label>
        <div className="flex gap-1.5 items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden />
          <input
            id="tx-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="En az 2 karakter…"
            className="flex-1 bg-[#181a1f] border border-[#272a32] text-zinc-200 text-xs rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          />
        </div>
        {hits.length > 0 && (
          <ul className="max-h-36 overflow-y-auto space-y-1">
            {hits.map((h) => (
              <li key={`${h.transcript.id}-${h.cue.id}`}>
                <button
                  type="button"
                  onClick={() =>
                    sendToUdemyTab({
                      type: 'NAVIGATE_LECTURE',
                      courseId: h.transcript.courseId,
                      lectureId: h.transcript.lectureId,
                      time: h.cue.startTime,
                    })
                  }
                  className="w-full text-left p-2 rounded-lg bg-[#16181e] border border-[#20232a] hover:bg-[#1c1f26] focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <div className="text-[11px] text-zinc-500">
                    {h.transcript.lectureTitle} · {fmtTime(h.cue.startTime)}
                  </div>
                  <div className="text-xs text-zinc-200 line-clamp-2">{h.cue.text}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-zinc-300">Kayıtlı notlar ({notes.length})</div>
        <button
          type="button"
          onClick={exportMd}
          disabled={notes.length === 0}
          className="inline-flex items-center gap-1 text-xs text-zinc-200 min-h-8 px-2 rounded-lg border border-[#272a32] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Download className="w-3.5 h-3.5" aria-hidden />
          Markdown
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-zinc-400">Udemy’de S tuşu: kare + çift altyazı notu.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="p-2.5 bg-[#111317] rounded-xl border border-[#1f2228] space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    sendToUdemyTab({
                      type: 'NAVIGATE_LECTURE',
                      courseId: note.courseId,
                      lectureId: note.lectureId,
                      time: note.time,
                    })
                  }
                  className="text-left min-w-0 focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                >
                  <div className="text-xs font-medium text-zinc-200 truncate">{note.lectureTitle}</div>
                  <div className="text-[11px] text-zinc-500">{fmtTime(note.time)}</div>
                </button>
                <button
                  type="button"
                  aria-label="Notu sil"
                  onClick={async () => setNotes(await deleteNote(note.id))}
                  className="min-w-8 min-h-8 flex items-center justify-center text-zinc-400 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
              {note.imageDataUrl ? (
                <img src={note.imageDataUrl} alt="" className="w-full rounded-md max-h-28 object-cover" />
              ) : null}
              {note.sourceText ? <p className="text-xs text-zinc-300">{note.sourceText}</p> : null}
              {note.translation ? <p className="text-xs text-zinc-400">{note.translation}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
