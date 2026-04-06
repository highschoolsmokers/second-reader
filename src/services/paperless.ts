import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

export interface PaperlessConfig {
  baseUrl: string;
  token: string;
}

export interface PaperlessDocument {
  id: number;
  title: string;
  correspondent: string | null;
  created: string;
  added: string;
  original_file_name: string;
  archived_file_name: string | null;
  tags: number[];
  content: string;
}

export interface PaperlessSearchResult {
  count: number;
  results: PaperlessDocument[];
}

function getConfig(): PaperlessConfig | null {
  const baseUrl = process.env.PAPERLESS_URL;
  const token = process.env.PAPERLESS_TOKEN;
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

export function isPaperlessConfigured(): boolean {
  return getConfig() !== null;
}

function authHeaders(config: PaperlessConfig): Record<string, string> {
  return {
    Authorization: `Token ${config.token}`,
    Accept: 'application/json',
  };
}

export async function searchPaperless(query: string): Promise<PaperlessSearchResult | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const url = `${config.baseUrl}/api/documents/?query=${encodeURIComponent(query)}&page_size=5&ordering=-created`;
    logger.info('Searching Paperless-ngx', { query });

    const res = await fetchWithRetry(url, { headers: authHeaders(config) });
    if (!res.ok) {
      logger.warn('Paperless search failed', { status: res.status });
      return null;
    }

    return (await res.json()) as PaperlessSearchResult;
  } catch (err) {
    logger.error('Paperless search error', { error: String(err) });
    return null;
  }
}

export async function downloadFromPaperless(documentId: number): Promise<string | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const url = `${config.baseUrl}/api/documents/${documentId}/download/`;
    logger.info('Downloading from Paperless-ngx', { documentId });

    const res = await fetchWithRetry(url, { headers: authHeaders(config) }, { timeoutMs: 60_000 });
    if (!res.ok) {
      logger.warn('Paperless download failed', { documentId, status: res.status });
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const dir = await mkdtemp(join(tmpdir(), 'lit-truth-'));
    const filePath = join(dir, `paperless-${documentId}.pdf`);
    await writeFile(filePath, buffer);

    logger.info('Downloaded from Paperless-ngx', { documentId, filePath, size: buffer.length });
    return filePath;
  } catch (err) {
    logger.error('Paperless download error', { error: String(err) });
    return null;
  }
}

export interface PaperlessTag {
  id: number;
  name: string;
}

let tagCache: Map<number, string> | null = null;

export async function getPaperlessTags(): Promise<Map<number, string>> {
  if (tagCache) return tagCache;

  const config = getConfig();
  if (!config) return new Map();

  try {
    const tags = new Map<number, string>();
    let url: string | null = `${config.baseUrl}/api/tags/?page_size=100`;

    while (url) {
      const res = await fetchWithRetry(url, { headers: authHeaders(config) });
      if (!res.ok) {
        logger.warn('Paperless tags fetch failed', { status: res.status });
        break;
      }
      const data = (await res.json()) as { results: PaperlessTag[]; next: string | null };
      for (const tag of data.results) {
        tags.set(tag.id, tag.name);
      }
      url = data.next;
    }

    tagCache = tags;
    return tags;
  } catch (err) {
    logger.error('Paperless tags fetch error', { error: String(err) });
    return new Map();
  }
}

export interface PaperlessListOptions {
  limit?: number;
  offset?: number;
  ordering?: string;
}

export interface PaperlessListResult {
  count: number;
  results: PaperlessDocument[];
}

export async function listPaperlessDocuments(
  options: PaperlessListOptions = {},
): Promise<PaperlessListResult | null> {
  const config = getConfig();
  if (!config) return null;

  const { limit = 100, offset = 0, ordering = '-added' } = options;

  try {
    const params = new URLSearchParams({
      page_size: String(limit),
      offset: String(offset),
      ordering,
    });

    const url = `${config.baseUrl}/api/documents/?${params}`;
    logger.info('Listing Paperless-ngx documents', { limit, offset });

    const res = await fetchWithRetry(url, { headers: authHeaders(config) });
    if (!res.ok) {
      logger.warn('Paperless list failed', { status: res.status });
      return null;
    }

    return (await res.json()) as PaperlessListResult;
  } catch (err) {
    logger.error('Paperless list error', { error: String(err) });
    return null;
  }
}

export async function uploadToPaperless(
  filePath: string,
  metadata: { title?: string; correspondent?: string; tags?: string[] },
): Promise<{ id: number; title: string } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const { readFile } = await import('node:fs/promises');
    const fileBuffer = await readFile(filePath);
    const filename = filePath.split('/').pop() || 'document.pdf';

    // Paperless-ngx uses multipart form upload
    const formData = new FormData();
    formData.append('document', new Blob([fileBuffer], { type: 'application/pdf' }), filename);
    if (metadata.title) formData.append('title', metadata.title);
    if (metadata.correspondent) formData.append('correspondent', metadata.correspondent);

    const url = `${config.baseUrl}/api/documents/post_document/`;
    logger.info('Uploading to Paperless-ngx', { filename, title: metadata.title });

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Token ${config.token}` },
        body: formData,
      },
      { timeoutMs: 120_000 },
    );

    if (!res.ok) {
      const body = await res.text();
      logger.warn('Paperless upload failed', { status: res.status, body });
      return null;
    }

    // post_document returns a task ID; the document is processed async.
    // We return a placeholder — the document will appear in Paperless shortly.
    const taskId = await res.text();
    logger.info('Uploaded to Paperless-ngx', { taskId, title: metadata.title });

    return { id: 0, title: metadata.title || filename };
  } catch (err) {
    logger.error('Paperless upload error', { error: String(err) });
    return null;
  }
}
