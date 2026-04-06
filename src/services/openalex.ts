import type { ExternalCitationResult } from '../types.js';
import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

export async function queryOpenAlex(params: {
  doi?: string;
  title?: string;
  author?: string;
}): Promise<ExternalCitationResult | null> {
  try {
    let url: string;
    if (params.doi) {
      url = `https://api.openalex.org/works/doi:${encodeURIComponent(params.doi)}`;
    } else if (params.title) {
      url = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(params.title)}&per_page=1`;
    } else {
      return null;
    }

    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'mailto:your@email.com' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const work = params.doi ? data : ((data.results as unknown[])?.[0] as Record<string, unknown>);
    if (!work) return null;

    const authorships = work.authorships as
      | Array<{
          author: { display_name: string };
        }>
      | undefined;
    const primaryLocation = work.primary_location as Record<string, unknown> | undefined;
    const source = primaryLocation?.source as Record<string, unknown> | undefined;
    const biblio = work.biblio as Record<string, string> | undefined;

    return {
      doi: ((work.doi as string) || '').replace('https://doi.org/', '') || null,
      title: (work.title as string) || '',
      authors: authorships?.map((a) => a.author?.display_name) || [],
      year: (work.publication_year as number) || null,
      journal: (source?.display_name as string) || null,
      volume: biblio?.volume || null,
      issue: biblio?.issue || null,
      pages: biblio?.first_page && biblio?.last_page ? `${biblio.first_page}-${biblio.last_page}` : null,
      publisher: (source?.host_organization_name as string) || null,
      url: (work.id as string) || null,
      abstract: work.abstract_inverted_index
        ? reconstructAbstract(work.abstract_inverted_index as Record<string, number[]>)
        : null,
      source: 'openalex',
      crossref_data: null,
      semantic_scholar_data: null,
      openalex_data: work,
    };
  } catch (err) {
    logger.error('OpenAlex query failed', { error: String(err), params });
    return null;
  }
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map((w) => w[0]).join(' ');
}
