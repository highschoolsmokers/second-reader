import type { ExternalCitationResult } from '../types.js';
import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

const USER_AGENT = 'LiteraryTruthMCP/1.0 (mailto:your@email.com)';

export async function queryCrossRef(params: {
  doi?: string;
  title?: string;
  author?: string;
}): Promise<ExternalCitationResult | null> {
  try {
    let url: string;
    if (params.doi) {
      url = `https://api.crossref.org/works/${encodeURIComponent(params.doi)}`;
    } else {
      const searchParams = new URLSearchParams();
      if (params.title) searchParams.set('query.title', params.title);
      if (params.author) searchParams.set('query.author', params.author);
      searchParams.set('rows', '1');
      url = `https://api.crossref.org/works?${searchParams}`;
    }

    const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const message = data.message as Record<string, unknown>;
    const work = params.doi ? message : ((message?.items as unknown[])?.[0] as Record<string, unknown>);
    if (!work) return null;

    const author = work.author as Array<{ given?: string; family?: string }> | undefined;
    const published = work.published as { 'date-parts'?: number[][] } | undefined;
    const containerTitle = work['container-title'] as string[] | undefined;

    return {
      doi: (work.DOI as string) || null,
      title: (work.title as string[])?.[0] || '',
      authors: author?.map((a) => `${a.given || ''} ${a.family || ''}`.trim()) || [],
      year: published?.['date-parts']?.[0]?.[0] || null,
      journal: containerTitle?.[0] || null,
      volume: (work.volume as string) || null,
      issue: (work.issue as string) || null,
      pages: (work.page as string) || null,
      publisher: (work.publisher as string) || null,
      url: (work.URL as string) || null,
      abstract: (work.abstract as string) || null,
      source: 'crossref',
      crossref_data: work,
      semantic_scholar_data: null,
      openalex_data: null,
    };
  } catch (err) {
    logger.error('CrossRef query failed', { error: String(err), params });
    return null;
  }
}
