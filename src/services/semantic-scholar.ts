import type { ExternalCitationResult } from '../types.js';
import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

const FIELDS = 'title,authors,year,venue,externalIds,abstract,publicationDate';

export async function querySemanticScholar(params: {
  doi?: string;
  title?: string;
  author?: string;
}): Promise<ExternalCitationResult | null> {
  try {
    let url: string;
    const headers: Record<string, string> = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }

    if (params.doi) {
      url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(params.doi)}?fields=${FIELDS}`;
    } else {
      const query = [params.title, params.author].filter(Boolean).join(' ');
      url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=1&fields=${FIELDS}`;
    }

    // Semantic Scholar rate-limits aggressively — use longer backoff
    const res = await fetchWithRetry(url, { headers }, { baseDelayMs: 1000 });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const paper = params.doi ? data : ((data.data as unknown[])?.[0] as Record<string, unknown>);
    if (!paper) return null;

    const authors = paper.authors as Array<{ name: string }> | undefined;
    const externalIds = paper.externalIds as Record<string, string> | undefined;

    return {
      doi: externalIds?.DOI || null,
      title: (paper.title as string) || '',
      authors: authors?.map((a) => a.name) || [],
      year: (paper.year as number) || null,
      journal: (paper.venue as string) || null,
      volume: null,
      issue: null,
      pages: null,
      publisher: null,
      url: `https://www.semanticscholar.org/paper/${paper.paperId as string}`,
      abstract: (paper.abstract as string) || null,
      source: 'semantic_scholar',
      crossref_data: null,
      semantic_scholar_data: paper,
      openalex_data: null,
    };
  } catch (err) {
    logger.error('Semantic Scholar query failed', { error: String(err), params });
    return null;
  }
}
