// Tolerant readers for telemetry payloads: the backend shape may nest
// metrics under different keys, so look in a few likely places.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function candidates(t, groupKeys) {
  const out = [t];
  for (const k of groupKeys) if (isObj(t?.[k])) out.push(t[k]);
  return out;
}

function pick(t, groupKeys, names) {
  for (const scope of candidates(t, groupKeys)) {
    for (const n of names) {
      const v = num(scope?.[n]);
      if (v !== null) return v;
    }
  }
  return null;
}

function stageMs(t, aliases) {
  // 1) flat/grouped keys: embeddingMs, timings.embedding, latency.embeddingMs ...
  const direct = pick(
    t,
    ['latency', 'latencies', 'timings', 'stages', 'stageLatencyMs', 'timingsMs'],
    aliases.flatMap((a) => [`${a}Ms`, `${a}_ms`, `${a}LatencyMs`, a])
  );
  if (direct !== null) return direct;
  // 2) nested object: telemetry.embedding.ms / latencyMs / durationMs
  for (const a of aliases) {
    const o = t?.[a];
    if (isObj(o)) {
      const v = num(o.ms) ?? num(o.latencyMs) ?? num(o.durationMs) ?? num(o.elapsedMs);
      if (v !== null) return v;
    }
  }
  return null;
}

export function getOverview(t) {
  const cache = isObj(t?.cache) ? t.cache : {};
  return {
    hit: cache.hit === true,
    known: isObj(t?.cache) && typeof cache.hit === 'boolean',
    similarity: num(cache.similarity) ?? num(cache.score) ?? num(cache.cosine) ?? num(cache.cosineSimilarity),
    totalMs:
      num(t?.totalLatencyMs) ?? pick(t, ['latency', 'timings'], ['totalMs', 'total', 'totalLatencyMs']),
  };
}

export function getStages(t) {
  const cacheMs = stageMs(t, ['cacheLookup', 'cache', 'semanticCache']);
  return [
    { key: 'embedding', label: 'Embedding', ms: stageMs(t, ['embedding', 'embed', 'embeddingLatency']) },
    { key: 'cache', label: 'Cache Lookup', ms: cacheMs ?? num(t?.cache?.lookupMs) ?? num(t?.cache?.latencyMs) },
    { key: 'retrieval', label: 'Hybrid Retrieval', ms: stageMs(t, ['hybridRetrieval', 'retrieval', 'retrieve', 'search']) },
    { key: 'rerank', label: 'Reranking', ms: stageMs(t, ['reranking', 'reranker', 'rerank']) },
    { key: 'generation', label: 'Generation', ms: stageMs(t, ['generation', 'generate', 'llm']) },
  ];
}

export function getFunnel(t) {
  const r = isObj(t?.retrieval) ? t.retrieval : {};
  const rr = isObj(t?.reranker) ? t.reranker : isObj(t?.rerank) ? t.rerank : {};
  const g = (obj, names) => {
    for (const n of names) {
      const v = obj[n];
      if (typeof v === 'number') return v;
      if (Array.isArray(v)) return v.length;
    }
    return null;
  };
  const scopes = [r, t || {}];
  const first = (names) => {
    for (const s of scopes) {
      const v = g(s, names);
      if (v !== null) return v;
    }
    return null;
  };
  return {
    mode: r.searchMode ?? r.mode ?? t?.searchMode ?? null,
    dense: first(['denseCount', 'dense', 'denseResults', 'denseHits']),
    fts: first(['ftsCount', 'fts', 'ftsResults', 'ftsHits']),
    fused: first(['fusedCount', 'rrfCount', 'rrfFused', 'fused']),
    topN: g(rr, ['topN', 'rerankedCount', 'count', 'returned', 'chunks']) ?? first(['topN', 'rerankedCount']),
  };
}

export function getChunks(t) {
  const rr = isObj(t?.reranker) ? t.reranker : isObj(t?.rerank) ? t.rerank : {};
  return Array.isArray(rr.chunks) ? rr.chunks : [];
}

export const fmtMs = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);
export const fmtScore = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '—');
