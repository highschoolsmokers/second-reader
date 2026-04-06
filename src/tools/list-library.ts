import type { z } from 'zod';
import type { ListLibraryInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { createRequestId, logger } from '../services/logger.js';
import {
  getPaperlessTags,
  isPaperlessConfigured,
  listPaperlessDocuments,
} from '../services/paperless.js';

type ListLibraryParams = z.infer<typeof ListLibraryInput>;

interface LibraryDocument {
  id: string;
  title: string;
  author?: string;
  year?: number;
  translator?: string;
  source: 'paperless' | 'corpus' | 'both';
  full_text_indexed: boolean;
  tags: string[];
  ingested_at?: string;
  page_count?: number;
  format?: string;
}

function normalizeKey(title: string, author?: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(the|a|an)\s+/i, '')
      .trim();
  return `${norm(title)}||${author ? norm(author) : ''}`;
}

function matchesFilter(
  doc: { title: string; author?: string; tags?: string[]; ingested_at?: string },
  filter?: ListLibraryParams['filter'],
): boolean {
  if (!filter) return true;

  if (filter.author && (!doc.author || !doc.author.toLowerCase().includes(filter.author.toLowerCase()))) {
    return false;
  }
  if (filter.title && !doc.title.toLowerCase().includes(filter.title.toLowerCase())) {
    return false;
  }
  if (filter.tag && (!doc.tags || !doc.tags.includes(filter.tag))) {
    return false;
  }
  if (filter.ingested_after && doc.ingested_at) {
    if (doc.ingested_at < filter.ingested_after) return false;
  }
  return true;
}

async function fetchCorpusDocuments(
  filter?: ListLibraryParams['filter'],
): Promise<LibraryDocument[]> {
  const sql = getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filter?.author) {
    conditions.push(`ct.author ILIKE $${paramIdx++}`);
    params.push(`%${filter.author}%`);
  }
  if (filter?.title) {
    conditions.push(`ct.title ILIKE $${paramIdx++}`);
    params.push(`%${filter.title}%`);
  }
  if (filter?.ingested_after) {
    conditions.push(`ct.created_at >= $${paramIdx++}`);
    params.push(filter.ingested_after);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await sql(
    `SELECT ct.id, ct.title, ct.author, ct.year, ct.translator,
            ct.created_at, ct.page_count, ct.format
     FROM canonical_texts ct
     ${where}
     ORDER BY ct.created_at DESC`,
    params,
  );

  return rows.map((row) => ({
    id: `corpus-${row.id}`,
    title: row.title as string,
    author: (row.author as string) || undefined,
    year: (row.year as number) || undefined,
    translator: (row.translator as string) || undefined,
    source: 'corpus' as const,
    full_text_indexed: true,
    tags: [],
    ingested_at: row.created_at ? (row.created_at as string) : undefined,
    page_count: (row.page_count as number) || undefined,
    format: (row.format as string) || undefined,
  }));
}

async function fetchPaperlessDocuments(
  filter?: ListLibraryParams['filter'],
): Promise<LibraryDocument[]> {
  if (!isPaperlessConfigured()) return [];

  const result = await listPaperlessDocuments({ limit: 500 });
  if (!result) return [];

  const tagMap = await getPaperlessTags();

  const docs: LibraryDocument[] = [];
  for (const doc of result.results) {
    const tags = doc.tags.map((id) => tagMap.get(id) || `tag-${id}`);
    const entry: LibraryDocument = {
      id: `paperless-${doc.id}`,
      title: doc.title,
      author: doc.correspondent || undefined,
      source: 'paperless',
      full_text_indexed: false,
      tags,
      ingested_at: doc.added,
      format: guessFormat(doc.original_file_name),
    };

    if (matchesFilter({ ...entry, tags }, filter)) {
      docs.push(entry);
    }
  }

  return docs;
}

function guessFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (ext === 'txt') return 'txt';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'other';
}

function mergeDocuments(
  corpusDocs: LibraryDocument[],
  paperlessDocs: LibraryDocument[],
): LibraryDocument[] {
  const merged = new Map<string, LibraryDocument>();

  for (const doc of corpusDocs) {
    merged.set(normalizeKey(doc.title, doc.author), doc);
  }

  for (const doc of paperlessDocs) {
    const key = normalizeKey(doc.title, doc.author);
    const existing = merged.get(key);

    if (existing) {
      // Document exists in both — merge
      existing.source = 'both';
      existing.tags = doc.tags.length > 0 ? doc.tags : existing.tags;
      if (!existing.format && doc.format) existing.format = doc.format;
    } else {
      merged.set(key, doc);
    }
  }

  return Array.from(merged.values());
}

export async function listLibrary(params: ListLibraryParams): Promise<string> {
  const reqId = createRequestId();
  logger.info('Listing library', { reqId, source: params.source, filter: params.filter });

  const source = params.source ?? 'all';
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  let documents: LibraryDocument[];

  if (source === 'corpus') {
    documents = await fetchCorpusDocuments(params.filter);
  } else if (source === 'paperless') {
    documents = await fetchPaperlessDocuments(params.filter);
  } else {
    const [corpusDocs, paperlessDocs] = await Promise.all([
      fetchCorpusDocuments(params.filter),
      fetchPaperlessDocuments(params.filter),
    ]);
    documents = mergeDocuments(corpusDocs, paperlessDocs);
  }

  // Sort by ingested_at descending
  documents.sort((a, b) => {
    if (!a.ingested_at) return 1;
    if (!b.ingested_at) return -1;
    return b.ingested_at.localeCompare(a.ingested_at);
  });

  const total = documents.length;
  const paginated = documents.slice(offset, offset + limit);

  logger.info('Library listing complete', { reqId, total, returned: paginated.length });

  return JSON.stringify({ total, documents: paginated }, null, 2);
}
