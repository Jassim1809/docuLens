import { useState } from 'react';
import { Aperture, PanelLeft, PanelRight, ChevronsUpDown } from 'lucide-react';

export default function Header({
  workspaceId,
  onWorkspaceChange,
  health,
  inspectorOpen,
  onToggleInspector,
  onToggleSidebar,
}) {
  const [draft, setDraft] = useState(workspaceId);

  const commit = () => {
    const next = draft.trim() || 'default';
    setDraft(next);
    if (next !== workspaceId) onWorkspaceChange(next);
  };

  const online = health.state === 'ok';
  const checking = health.state === 'loading';

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-3 px-3 sm:px-4 border-b border-zinc-800 bg-surface-1">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          aria-label="Toggle documents"
        >
          <PanelLeft size={16} />
        </button>
        <Aperture size={18} className="text-zinc-100" />
        <span className="text-sm font-semibold tracking-tight text-zinc-100">docuLens</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-md border border-zinc-800 bg-surface-0 focus-within:border-zinc-600">
          <span className="hidden sm:inline text-[11px] uppercase tracking-wider text-zinc-500">
            Workspace
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            spellCheck={false}
            className="w-24 sm:w-32 bg-transparent text-xs font-mono text-zinc-200 outline-none"
            aria-label="Workspace ID"
          />
          <ChevronsUpDown size={12} className="text-zinc-600" />
        </label>

        <div
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-zinc-800 text-xs"
          title={
            online
              ? `Chat model: ${health.data?.models?.chat ?? 'unknown'}\nEmbedding: ${health.data?.models?.embedding ?? 'unknown'}`
              : health.error || 'Backend unreachable'
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              checking ? 'bg-zinc-500 animate-pulse' : online ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <span className={online ? 'text-zinc-300' : checking ? 'text-zinc-500' : 'text-red-400'}>
            {checking ? 'Checking' : online ? 'Connected' : 'Offline'}
          </span>
          {online && health.data?.models?.chat && (
            <span className="hidden md:inline font-mono text-zinc-500">
              · {health.data.models.chat}
            </span>
          )}
        </div>

        <button
          onClick={onToggleInspector}
          className={`p-1.5 rounded-md border ${
            inspectorOpen
              ? 'border-zinc-700 bg-zinc-800 text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
          aria-label="Toggle RAG inspector"
          title="RAG Inspector"
        >
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  );
}
