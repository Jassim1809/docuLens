const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || body?.error || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch {
    /* non-JSON body */
  }
  const fallback =
    res.status === 400
      ? 'Bad request'
      : res.status === 503
        ? 'Service unavailable'
        : res.status >= 500
          ? 'Server error'
          : 'Request failed';
  return new ApiError(`${detail || fallback} (${res.status})`, res.status);
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, options);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Network error: could not reach the backend', 0);
  }
  if (!res.ok) throw await parseError(res);
  return res.status === 204 ? null : res.json();
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const getHealth = () => request('/health');

export const listDocuments = (workspaceId) =>
  request(`/documents?workspaceId=${encodeURIComponent(workspaceId)}`);

export function uploadDocuments(workspaceId, files) {
  const form = new FormData();
  form.append('workspaceId', workspaceId);
  files.forEach((f) => form.append('files', f));
  return request('/documents/upload', { method: 'POST', body: form });
}

export const deleteDocument = (docId, workspaceId) =>
  request(
    `/documents/${encodeURIComponent(docId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'DELETE' }
  );

export const clearCache = (workspaceId) =>
  request(`/cache/${encodeURIComponent(workspaceId)}`, { method: 'DELETE' });

function buildQueryBody({ workspaceId, query, docIds, searchMode, bypassCache }) {
  const body = { workspaceId, query, searchMode, bypassCache: !!bypassCache };
  if (docIds && docIds.length) body.docIds = docIds;
  return body;
}

/** Fallback: standard JSON query endpoint. */
export const queryOnce = (params, signal) =>
  request('/query', { ...json('POST', buildQueryBody(params)), signal });

/**
 * Streaming query over POST SSE using fetch + ReadableStream.
 * Handlers: onStatus(msg), onTelemetry(obj), onResult(obj), onDone(), onError(msg)
 */
export async function queryStream(params, handlers = {}, signal) {
  const { onStatus, onTelemetry, onResult, onDone, onError } = handlers;
  let res;
  try {
    res = await fetch(`${BASE_URL}/query/stream`, {
      ...json('POST', buildQueryBody(params)),
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') return;
    onError?.('Network error: could not reach the backend');
    return;
  }
  if (!res.ok) {
    onError?.((await parseError(res)).message);
    return;
  }
  if (!res.body) {
    onError?.('Streaming is not supported by this browser');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const dispatch = (rawBlock) => {
    let event = 'message';
    const dataLines = [];
    for (const line of rawBlock.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length && event !== 'done') return;
    const raw = dataLines.join('\n');
    let data = raw;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      if (event === 'result' || event === 'telemetry') {
        onError?.('Received a malformed response chunk from the server');
        return;
      }
    }
    switch (event) {
      case 'status':
        onStatus?.(typeof data === 'string' ? data : data?.message ?? data?.status ?? '');
        break;
      case 'telemetry':
        onTelemetry?.(data);
        break;
      case 'result':
        onResult?.(data);
        break;
      case 'error':
        finished = true;
        onError?.(
          typeof data === 'string' ? data : data?.message || data?.error?.message || data?.error || 'Query failed'
        );
        break;
      case 'done':
        finished = true;
        onDone?.();
        break;
      default:
        break;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        dispatch(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    }
    if (buffer.trim()) dispatch(buffer);
    if (!finished) onDone?.();
  } catch (err) {
    if (err?.name === 'AbortError') return;
    onError?.('Connection lost while streaming the response');
  }
}

export { BASE_URL };
