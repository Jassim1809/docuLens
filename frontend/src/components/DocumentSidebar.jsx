import { useRef, useState } from 'react';
import { FileText, Trash2, UploadCloud, Loader2, Copy, Check, Eraser, X } from 'lucide-react';

export default function DocumentSidebar({
  documents,
  loading,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearSelection,
  onUpload,
  onDelete,
  uploading,
  docSetHash,
  onClearCache,
  clearingCache,
  className = '',
  onClose,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleFiles = (fileList) => {
    const pdfs = Array.from(fileList || []).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfs.length) onUpload(pdfs);
    else if (fileList?.length) onUpload([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const copyHash = async () => {
    if (!docSetHash) return;
    try {
      await navigator.clipboard.writeText(docSetHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const allSelected = documents.length > 0 && selectedIds.length === documents.length;

  return (
    <aside className={`w-[260px] shrink-0 flex flex-col border-r border-zinc-800 bg-surface-1 ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-[11px] uppercase tracking-wider text-zinc-500">Documents</h2>
        <div className="flex items-center gap-2">
          {documents.length >= 2 && (
            <button
              onClick={allSelected ? onClearSelection : onSelectAll}
              className="text-[11px] text-zinc-500 hover:text-zinc-200"
            >
              {allSelected ? 'Clear' : 'Select all'}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="lg:hidden text-zinc-500 hover:text-zinc-200" aria-label="Close">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3">
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1 py-4 rounded-lg border border-dashed text-center cursor-pointer transition-colors ${
            dragging ? 'border-zinc-500 bg-zinc-800/60' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
          } ${uploading ? 'cursor-wait opacity-70' : ''}`}
        >
          {uploading ? (
            <Loader2 size={18} className="animate-spin text-zinc-400" />
          ) : (
            <UploadCloud size={18} className="text-zinc-500" />
          )}
          <p className="text-xs text-zinc-300">{uploading ? 'Ingesting…' : 'Drop PDFs or click to browse'}</p>
          <p className="text-[11px] text-zinc-600">Up to 5 files</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {loading && documents.length === 0 && (
          <li className="px-2 py-2 text-xs text-zinc-600">Loading…</li>
        )}
        {!loading && documents.length === 0 && (
          <li className="px-2 py-2 text-xs text-zinc-600">No documents in this workspace.</li>
        )}
        {documents.map((d) => (
          <li
            key={d.docId}
            className="group flex items-start gap-2 px-2 py-2 rounded-md hover:bg-zinc-900"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(d.docId)}
              onChange={() => onToggle(d.docId)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-emerald-500"
              aria-label={`Scope to ${d.fileName}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <FileText size={12} className="shrink-0 text-zinc-500" />
                <span className="truncate text-xs text-zinc-200" title={d.fileName}>
                  {d.fileName}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
                {d.numPages} pp · {d.chunkCount} chunks
              </p>
            </div>
            <button
              onClick={() => onDelete(d)}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
              aria-label={`Delete ${d.fileName}`}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">docSet</span>
          <button
            onClick={copyHash}
            disabled={!docSetHash}
            title={docSetHash ? `${docSetHash} (click to copy)` : 'No documents'}
            className="flex items-center gap-1 font-mono text-[11px] text-zinc-400 hover:text-zinc-100 disabled:hover:text-zinc-400"
          >
            {docSetHash ? docSetHash.slice(0, 10) : '—'}
            {docSetHash && (copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />)}
          </button>
        </div>
        <button
          onClick={onClearCache}
          disabled={clearingCache}
          className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-50"
        >
          {clearingCache ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
          Clear cache
        </button>
      </div>
    </aside>
  );
}
