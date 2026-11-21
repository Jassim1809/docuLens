import { X, Activity } from 'lucide-react';
import { getOverview, getStages, getFunnel, getChunks, fmtMs, fmtScore } from '../lib/telemetry.js';

const Section = ({ title, children }) => (
  <section className="px-4 py-4 border-b border-zinc-800 last:border-b-0">
    <h3 className="mb-3 text-[11px] uppercase tracking-wider text-zinc-500">{title}</h3>
    {children}
  </section>
);

export default function RagInspector({ message, onClose, className = '' }) {
  const t = message?.telemetry;

  return (
    <aside className={`w-[320px] shrink-0 flex flex-col border-l border-zinc-800 bg-surface-1 overflow-y-auto ${className}`}>
      <div className="flex items-center justify-between px-4 h-11 shrink-0 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Activity size={13} className="text-zinc-500" />
          RAG Inspector
        </div>
        <button onClick={onClose} className="xl:hidden text-zinc-500 hover:text-zinc-200" aria-label="Close inspector">
          <X size={14} />
        </button>
      </div>

      {!t ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-zinc-600">
          Ask a question to inspect retrieval telemetry.
        </div>
      ) : (
        <Body t={t} />
      )}
    </aside>
  );
}

function Body({ t }) {
  const ov = getOverview(t);
  const stages = getStages(t);
  const funnel = getFunnel(t);
  const chunks = getChunks(t);
  const maxMs = Math.max(1, ...stages.map((s) => s.ms ?? 0));

  return (
    <>
      <Section title="Overview">
        <div className="flex items-center justify-between">
          {ov.known ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono ${
                ov.hit
                  ? 'border-sky-900 bg-sky-950/40 text-sky-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400'
              }`}
            >
              {ov.hit ? 'CACHE HIT' : 'CACHE MISS'}
              {ov.similarity !== null && <span className="text-zinc-400">{ov.similarity.toFixed(2)}</span>}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-zinc-600">NO CACHE INFO</span>
          )}
          <span className="font-mono text-sm text-zinc-100">{fmtMs(ov.totalMs)}</span>
        </div>
      </Section>

      <Section title="Latency">
        <ul className="space-y-2.5">
          {stages.map((s) => (
            <li key={s.key}>
              <div className="flex items-center justify-between text-[11px]">
                <span className={s.ms === null ? 'text-zinc-600' : 'text-zinc-400'}>{s.label}</span>
                <span className={`font-mono ${s.ms === null ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  {s.ms === null ? (ov.hit ? 'skipped' : '—') : fmtMs(s.ms)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-zinc-500"
                  style={{ width: s.ms === null ? '0%' : `${Math.max(2, (s.ms / maxMs) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Retrieval funnel${funnel.mode ? ` · ${funnel.mode}` : ''}`}>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Dense', funnel.dense],
            ['FTS', funnel.fts],
            ['RRF Fused', funnel.fused],
            ['Top-N Reranked', funnel.topN],
          ].map(([label, v]) => (
            <div key={label} className="rounded-md border border-zinc-800 bg-surface-0 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
              <p className="mt-0.5 font-mono text-sm text-zinc-200">{v ?? '—'}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Top chunks">
        {chunks.length === 0 ? (
          <p className="text-xs text-zinc-600">
            {ov.hit ? 'Served from cache — no retrieval performed.' : 'No chunk data for this response.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {chunks.map((c, i) => (
              <li key={c.chunkId ?? i} className="rounded-md border border-zinc-800 bg-surface-0 px-3 py-2">
                <p className="truncate text-xs text-zinc-300" title={c.fileName}>
                  {c.fileName ?? 'unknown'}
                  <span className="font-mono text-zinc-500"> · p. {c.pageNumber ?? c.page ?? '—'}</span>
                </p>
                <dl className="mt-1.5 grid grid-cols-4 gap-1 font-mono text-[10px]">
                  {[
                    ['dense', c.denseRank ?? '—'],
                    ['fts', c.ftsRank ?? '—'],
                    ['rrf', fmtScore(c.rrfScore, 4)],
                    ['rerank', fmtScore(c.rerankScore, 2)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-zinc-600">{k}</dt>
                      <dd className="text-zinc-300">{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
