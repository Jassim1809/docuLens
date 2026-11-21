import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import Header from './components/Header.jsx';
import DocumentSidebar from './components/DocumentSidebar.jsx';
import ChatPane from './components/ChatPane.jsx';
import RagInspector from './components/RagInspector.jsx';
import * as api from './lib/api.js';

let idCounter = 0;
const nextId = () => `m_${Date.now()}_${idCounter++}`;

export default function App() {
  const [workspaceId, setWorkspaceId] = useState('default');
  const [health, setHealth] = useState({ state: 'loading' });
  const [documents, setDocuments] = useState([]);
  const [docSetHash, setDocSetHash] = useState('');
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const [messages, setMessages] = useState([]);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('');
  const [searchMode, setSearchMode] = useState('hybrid');
  const [bypassCache, setBypassCache] = useState(false);

  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [chatError, setChatError] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const abortRef = useRef(null);
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;
  const noticeTimer = useRef(null);

  const showNotice = useCallback((type, text, ms = 6000) => {
    setNotice({ type, text });
    clearTimeout(noticeTimer.current);
    if (ms) noticeTimer.current = setTimeout(() => setNotice(null), ms);
  }, []);

  // Health check on mount
  useEffect(() => {
    let cancelled = false;
    api
      .getHealth()
      .then((data) => !cancelled && setHealth({ state: data?.status === 'ok' ? 'ok' : 'error', data }))
      .catch((e) => !cancelled && setHealth({ state: 'error', error: e.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDocuments = useCallback(
    async (ws) => {
      setDocsLoading(true);
      try {
        const data = await api.listDocuments(ws);
        if (workspaceRef.current !== ws) return;
        const docs = Array.isArray(data) ? data : data?.documents ?? [];
        setDocuments(docs);
        setDocSetHash(data?.docSetHash ?? '');
        setSelectedIds((prev) => prev.filter((id) => docs.some((d) => d.docId === id)));
      } catch (e) {
        if (workspaceRef.current === ws) {
          setDocuments([]);
          setDocSetHash('');
          showNotice('error', `Could not load documents: ${e.message}`, 0);
        }
      } finally {
        if (workspaceRef.current === ws) setDocsLoading(false);
      }
    },
    [showNotice]
  );

  useEffect(() => {
    loadDocuments(workspaceId);
  }, [workspaceId, loadDocuments]);

  const resetChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSelectedMessageId(null);
    setStreaming(false);
    setStatus('');
    setChatError('');
  };

  const switchWorkspace = (ws) => {
    resetChat();
    setSelectedIds([]);
    setDocuments([]);
    setDocSetHash('');
    setNotice(null);
    setWorkspaceId(ws);
  };

  const handleUpload = async (files) => {
    if (!files.length) {
      showNotice('error', 'Only PDF files are supported.');
      return;
    }
    let batch = files;
    if (files.length > 5) {
      batch = files.slice(0, 5);
      showNotice('error', 'Maximum 5 files per upload — uploading the first 5.');
    }
    const ws = workspaceId;
    setUploading(true);
    try {
      const res = await api.uploadDocuments(ws, batch);
      if (workspaceRef.current !== ws) return;
      const results = res?.results ?? [];
      const chunks = results.reduce((s, r) => s + (r.document?.chunkCount ?? 0), 0);
      const ms = results.reduce((s, r) => s + (r.ingestionMs ?? 0), 0);
      showNotice(
        'success',
        `Uploaded ${res?.uploadedCount ?? results.length} file${results.length === 1 ? '' : 's'} · ${chunks} chunks · ${ms} ms`
      );
      if (res?.docSetHash) setDocSetHash(res.docSetHash);
      await loadDocuments(ws);
    } catch (e) {
      showNotice('error', `Upload failed: ${e.message}`, 0);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    const ws = workspaceId;
    try {
      const res = await api.deleteDocument(doc.docId, ws);
      if (workspaceRef.current !== ws) return;
      if (res?.docSetHash !== undefined) setDocSetHash(res.docSetHash);
      setDocuments((prev) => prev.filter((d) => d.docId !== doc.docId));
      setSelectedIds((prev) => prev.filter((id) => id !== doc.docId));
      loadDocuments(ws);
    } catch (e) {
      showNotice('error', `Delete failed: ${e.message}`, 0);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await api.clearCache(workspaceId);
      showNotice('success', 'Semantic cache cleared.');
    } catch (e) {
      showNotice('error', `Could not clear cache: ${e.message}`, 0);
    } finally {
      setClearingCache(false);
    }
  };

  const handleSend = async (query) => {
    const ws = workspaceId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setChatError('');
    setStreaming(true);
    setStatus('Starting…');
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: query }]);

    let pendingTelemetry = null;
    let settled = false;
    const live = () => workspaceRef.current === ws && abortRef.current === controller;

    const finish = () => {
      if (!live()) return;
      setStreaming(false);
      setStatus('');
    };

    const params = {
      workspaceId: ws,
      query,
      docIds: selectedIds,
      searchMode,
      bypassCache,
    };

    await api.queryStream(
      params,
      {
        onStatus: (s) => live() && s && setStatus(s),
        onTelemetry: (t) => {
          pendingTelemetry = t;
        },
        onResult: (r) => {
          if (!live() || !r) return;
          settled = true;
          const id = nextId();
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: 'assistant',
              content: r.answer ?? '',
              grounded: !!r.grounded,
              citations: Array.isArray(r.citations) ? r.citations : [],
              telemetry: r.telemetry ?? pendingTelemetry,
            },
          ]);
          setSelectedMessageId(id);
        },
        onError: (msg) => {
          if (!live()) return;
          settled = true;
          setChatError(msg);
          finish();
        },
        onDone: () => {
          if (live() && !settled) setChatError('The server closed the stream without returning an answer.');
          finish();
        },
      },
      controller.signal
    );
    finish();
  };

  const toggleDoc = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectedMessage =
    messages.find((m) => m.id === selectedMessageId && m.role === 'assistant') ?? null;

  return (
    <div className="h-full flex flex-col">
      <Header
        workspaceId={workspaceId}
        onWorkspaceChange={switchWorkspace}
        health={health}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      {notice && (
        <div
          className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${
            notice.type === 'success'
              ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300'
              : 'border-red-900/60 bg-red-950/30 text-red-300'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span className="flex-1 font-mono">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex relative">
        {sidebarOpen && (
          <div
            className="lg:hidden absolute inset-0 z-20 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <DocumentSidebar
          className={`${
            sidebarOpen ? 'absolute inset-y-0 left-0 z-30 flex' : 'hidden'
          } lg:static lg:flex`}
          onClose={() => setSidebarOpen(false)}
          documents={documents}
          loading={docsLoading}
          selectedIds={selectedIds}
          onToggle={toggleDoc}
          onSelectAll={() => setSelectedIds(documents.map((d) => d.docId))}
          onClearSelection={() => setSelectedIds([])}
          onUpload={handleUpload}
          onDelete={handleDelete}
          uploading={uploading}
          docSetHash={docSetHash}
          onClearCache={handleClearCache}
          clearingCache={clearingCache}
        />

        <ChatPane
          messages={messages}
          streaming={streaming}
          status={status}
          onSend={handleSend}
          selectedMessageId={selectedMessageId}
          onSelectMessage={setSelectedMessageId}
          docCount={documents.length}
          selectedCount={selectedIds.length}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          bypassCache={bypassCache}
          onBypassChange={setBypassCache}
          error={chatError}
          onDismissError={() => setChatError('')}
        />

        {inspectorOpen && (
          <>
            <div
              className="xl:hidden absolute inset-0 z-20 bg-black/60"
              onClick={() => setInspectorOpen(false)}
            />
            <RagInspector
              message={selectedMessage}
              onClose={() => setInspectorOpen(false)}
              className="absolute inset-y-0 right-0 z-30 max-w-full xl:static"
            />
          </>
        )}
      </div>
    </div>
  );
}
