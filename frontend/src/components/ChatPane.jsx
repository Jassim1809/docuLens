import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AlertCircle, X, Zap, FileSearch } from 'lucide-react';
import CitationCard from './CitationCard.jsx';
import { fmtMs } from '../lib/telemetry.js';

const MODES = [
  ['hybrid', 'Hybrid'],
  ['dense', 'Dense'],
  ['fts', 'FTS'],
];

const EXAMPLES = [
  'Summarize the key points of these documents',
  'What are the main conclusions?',
  'List any dates, figures, or deadlines mentioned',
];

function AssistantMessage({ m, active, onSelect }) {
  const hit = m.telemetry?.cache?.hit === true;
  const total = m.telemetry?.totalLatencyMs;

  return (
    <div
      onClick={() => onSelect(m.id)}
      className={`cursor-pointer border-l-2 pl-4 py-1 transition-colors ${
        active ? 'border-zinc-500' : 'border-transparent hover:border-zinc-800'
      }`}
    >
      {m.error ? (
        <p className="text-sm text-red-400">{m.error}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                m.grounded
                  ? 'border-emerald-900 bg-emerald-950/40 text-emerald-400'
                  : 'border-amber-900 bg-amber-950/40 text-amber-400'
              }`}
            >
              {m.grounded ? 'Grounded' : 'Not Found in Docs'}
            </span>
            {hit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(m.id);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-sky-900 bg-sky-950/40 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-sky-950"
                title="Open in inspector"
              >
                <Zap size={10} />
                Cache Hit
                <span className="font-mono text-sky-400/80">{fmtMs(total)}</span>
              </button>
            )}
          </div>
          <p className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">{m.content}</p>
          <CitationCard citations={m.citations} />
        </>
      )}
    </div>
  );
}

export default function ChatPane({
  messages,
  streaming,
  status,
  onSend,
  selectedMessageId,
  onSelectMessage,
  docCount,
  selectedCount,
  searchMode,
  onSearchModeChange,
  bypassCache,
  onBypassChange,
  error,
  onDismissError,
}) {
  const [text, setText] = useState('');
  const taRef = useRef(null);
  const endRef = useRef(null);
  const noDocs = docCount === 0;
  const disabled = streaming || noDocs;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = (value = text) => {
    const q = value.trim();
    if (!q || disabled) return;
    setText('');
    onSend(q);
  };

  const scope =
    selectedCount > 0
      ? `Searching ${selectedCount} selected doc${selectedCount === 1 ? '' : 's'}`
      : `Searching all ${docCount} doc${docCount === 1 ? '' : 's'}`;

  return (
    <main className="flex-1 min-w-0 flex flex-col bg-surface-0">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <FileSearch size={28} className="text-zinc-700 mb-4" />
            {noDocs ? (
              <>
                <h2 className="text-base text-zinc-200">Upload a PDF to get started</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Add documents from the left pane, then ask grounded questions.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-base text-zinc-200">Ask your documents</h2>
                <p className="mt-1 text-sm text-zinc-500">Answers are grounded with page-level citations.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-xl">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => submit(ex)}
                      disabled={streaming}
                      className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl bg-zinc-800/70 px-3.5 py-2 text-sm text-zinc-100 whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={m.id}
                  m={m}
                  active={m.id === selectedMessageId}
                  onSelect={onSelectMessage}
                />
              )
            )}
            {streaming && (
              <div className="flex items-center gap-2 pl-4 text-xs text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" />
                <span>{status || 'Working…'}</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto max-w-2xl">
          {error && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={onDismissError} aria-label="Dismiss" className="text-red-400 hover:text-red-200">
                <X size={13} />
              </button>
            </div>
          )}
          <div className="rounded-xl border border-zinc-800 bg-surface-1 focus-within:border-zinc-700">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pt-2.5">
              <div className="inline-flex rounded-md border border-zinc-800 p-0.5">
                {MODES.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => onSearchModeChange(val)}
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      searchMode === val ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bypassCache}
                  onChange={(e) => onBypassChange(e.target.checked)}
                  className="h-3 w-3 rounded border-zinc-700 bg-zinc-900 accent-emerald-500"
                />
                Bypass cache
              </label>
              {!noDocs && <span className="ml-auto text-[11px] font-mono text-zinc-600">{scope}</span>}
            </div>
            <div className="flex items-end gap-2 px-3 pb-2.5 pt-2">
              <textarea
                ref={taRef}
                rows={1}
                value={text}
                disabled={disabled}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={noDocs ? 'Upload a document to start' : 'Ask a question…'}
                className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none disabled:cursor-not-allowed"
              />
              <button
                onClick={() => submit()}
                disabled={disabled || !text.trim()}
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-900 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600"
                aria-label="Send"
              >
                <ArrowUp size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
