import type { z } from 'zod';
import type { ExportBibliographyInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { createRequestId, logger } from '../services/logger.js';

type ExportBibliographyParams = z.infer<typeof ExportBibliographyInput>;

interface CitationRow {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
}

function formatMLA(c: CitationRow): string {
  const authors = formatAuthors(c.authors, 'mla');
  const title = `"${c.title}."`;
  const journal = c.journal ? `*${c.journal}*` : '';
  const vol = c.volume ? `, vol. ${c.volume}` : '';
  const iss = c.issue ? `, no. ${c.issue}` : '';
  const year = c.year ? `, ${c.year}` : '';
  const pages = c.pages ? `, pp. ${c.pages}` : '';
  const doi = c.doi ? ` https://doi.org/${c.doi}.` : '';

  if (c.journal) {
    return `${authors} ${title} ${journal}${vol}${iss}${year}${pages}.${doi}`;
  }
  // Book format
  const pub = c.publisher ? ` ${c.publisher},` : '';
  return `${authors} *${c.title}*.${pub}${year ? ` ${c.year}.` : ''}${doi}`;
}

function formatChicago(c: CitationRow): string {
  const authors = formatAuthors(c.authors, 'chicago');
  const year = c.year ? ` ${c.year}.` : '';
  const title = c.journal ? `"${c.title}."` : `*${c.title}*.`;
  const journal = c.journal ? ` *${c.journal}*` : '';
  const vol = c.volume ? ` ${c.volume}` : '';
  const iss = c.issue ? `, no. ${c.issue}` : '';
  const pages = c.pages ? `: ${c.pages}` : '';
  const pub = !c.journal && c.publisher ? ` ${c.publisher}.` : '';
  const doi = c.doi ? ` https://doi.org/${c.doi}.` : '';

  return `${authors} ${title}${journal}${vol}${iss}${year}${pages}.${pub}${doi}`;
}

function formatAPA(c: CitationRow): string {
  const authors = formatAuthors(c.authors, 'apa');
  const year = c.year ? ` (${c.year}).` : '';
  const title = c.journal ? ` ${c.title}.` : ` *${c.title}*.`;
  const journal = c.journal ? ` *${c.journal}*` : '';
  const vol = c.volume ? `, *${c.volume}*` : '';
  const iss = c.issue ? `(${c.issue})` : '';
  const pages = c.pages ? `, ${c.pages}` : '';
  const pub = !c.journal && c.publisher ? ` ${c.publisher}.` : '';
  const doi = c.doi ? ` https://doi.org/${c.doi}` : '';

  return `${authors}${year}${title}${journal}${vol}${iss}${pages}.${pub}${doi}`;
}

function formatAuthors(authors: string[], style: 'mla' | 'chicago' | 'apa'): string {
  if (!authors || authors.length === 0) return 'Unknown.';

  if (style === 'apa') {
    // APA: "Last, F. M., & Last, F. M."
    if (authors.length === 1) return `${invertName(authors[0])}.`;
    if (authors.length === 2) return `${invertName(authors[0])}, & ${invertName(authors[1])}.`;
    return `${invertName(authors[0])}, et al.`;
  }

  // MLA/Chicago: "Last, First, and First Last."
  if (authors.length === 1) return `${invertName(authors[0])}.`;
  if (authors.length === 2) return `${invertName(authors[0])}, and ${authors[1]}.`;
  return `${invertName(authors[0])}, et al.`;
}

function invertName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const last = parts.pop()!;
  return `${last}, ${parts.join(' ')}`;
}

export async function exportBibliography(params: ExportBibliographyParams): Promise<string> {
  const sql = getDb();
  const reqId = createRequestId();
  const style = params.style ?? 'chicago';
  logger.info('Exporting bibliography', { reqId, style, citationCount: params.citation_ids?.length });

  let citations: CitationRow[];

  if (params.citation_ids && params.citation_ids.length > 0) {
    // Fetch specific citations
    const placeholders = params.citation_ids.map((_, i) => `$${i + 1}`).join(', ');
    citations = (await sql(
      `SELECT id, title, authors, year, journal, volume, issue, pages, publisher, doi, url
       FROM citations WHERE id IN (${placeholders}) AND bibliographic_verified = TRUE
       ORDER BY authors, year`,
      params.citation_ids,
    )) as unknown as CitationRow[];
  } else if (params.session_id) {
    // Fetch citations referenced in a session's verification log
    citations = (await sql(
      `SELECT DISTINCT c.id, c.title, c.authors, c.year, c.journal, c.volume, c.issue, c.pages, c.publisher, c.doi, c.url
       FROM citations c
       JOIN verification_log vl ON vl.details::text LIKE '%' || c.id::text || '%'
       WHERE vl.session_id = $1 AND c.bibliographic_verified = TRUE
       ORDER BY c.authors, c.year`,
      [params.session_id],
    )) as unknown as CitationRow[];
  } else {
    // Export all verified citations
    citations = (await sql(
      `SELECT id, title, authors, year, journal, volume, issue, pages, publisher, doi, url
       FROM citations WHERE bibliographic_verified = TRUE
       ORDER BY authors, year`,
    )) as unknown as CitationRow[];
  }

  if (citations.length === 0) {
    return JSON.stringify({
      status: 'empty',
      message: 'No verified citations found matching the criteria.',
    });
  }

  const formatter = style === 'mla' ? formatMLA : style === 'apa' ? formatAPA : formatChicago;

  const entries = citations.map((c) => ({
    citation_id: c.id,
    formatted: formatter(c).replace(/\s+/g, ' ').trim(),
  }));

  const worksCited = entries.map((e) => e.formatted).join('\n\n');

  const heading = style === 'mla' ? 'Works Cited' : style === 'apa' ? 'References' : 'Bibliography';

  return JSON.stringify(
    {
      status: 'exported',
      style,
      heading,
      count: entries.length,
      formatted_text: `${heading}\n\n${worksCited}`,
      entries,
    },
    null,
    2,
  );
}
