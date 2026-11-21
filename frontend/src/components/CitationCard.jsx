import { useState } from 'react';
import { Quote } from 'lucide-react';

export default function CitationCard({ citations = [] }) {
  const [open, setOpen] = useState(null);
  if (!citations.length) return null;

  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => (
          <button
            key={`${c.fileName}-${c.pageNumber}-${i}`}
            onClick={() => setOpen(open === i ? null : i)}
            className={`max-w-full truncate rounded-md border px-2 py-0.5 text-[11px] font-mono transition-colors ${
              open === i
                ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
            title={c.fileName}
          >
            {c.fileName} · p. {c.pageNumber}
          </button>
        ))}
      </div>
      {open !== null && citations[open] && (
        <blockquote className="mt-2 rounded-md border border-zinc-800 border-l-2 border-l-zinc-600 bg-surface-1 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1 text-[11px] font-mono text-zinc-500">
            <Quote size={11} />
            {citations[open].fileName} · p. {citations[open].pageNumber}
          </div>
          <p className="text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {citations[open].quote}
          </p>
        </blockquote>
      )}
    </div>
  );
}
