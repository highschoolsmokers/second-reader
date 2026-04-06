import type { z } from 'zod';
import type { AnnotateInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { createRequestId, logger } from '../services/logger.js';

type AnnotateParams = z.infer<typeof AnnotateInput>;

export async function annotate(params: AnnotateParams): Promise<string> {
  const sql = getDb();
  const reqId = createRequestId();
  logger.info('Creating annotation', { reqId, chunkId: params.chunk_id, tag: params.tag });

  // Verify the chunk exists and get context
  const chunks = await sql(
    `SELECT tc.id, tc.content, ct.title, ct.author
     FROM text_chunks tc
     JOIN canonical_texts ct ON tc.text_id = ct.id
     WHERE tc.id = $1`,
    [params.chunk_id],
  );

  if (chunks.length === 0) {
    return JSON.stringify({
      status: 'error',
      message: `Text chunk ${params.chunk_id} not found`,
    });
  }

  const chunk = chunks[0] as Record<string, unknown>;

  // Insert the annotation
  const rows = await sql(
    `INSERT INTO annotations (chunk_id, note, tag, session_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [params.chunk_id, params.note, params.tag || null, params.session_id || null],
  );

  const annotation = rows[0] as Record<string, unknown>;

  logger.info('Annotation created', { reqId, annotationId: annotation.id });

  return JSON.stringify(
    {
      status: 'created',
      annotation_id: annotation.id,
      chunk_id: params.chunk_id,
      source: {
        title: chunk.title,
        author: chunk.author,
        passage_preview: (chunk.content as string).slice(0, 150) + '...',
      },
      note: params.note,
      tag: params.tag || null,
      session_id: params.session_id || null,
    },
    null,
    2,
  );
}

export async function getAnnotations(options: {
  tag?: string;
  session_id?: string;
  chunk_id?: string;
}): Promise<string> {
  const sql = getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options.tag) {
    conditions.push(`a.tag = $${idx++}`);
    params.push(options.tag);
  }
  if (options.session_id) {
    conditions.push(`a.session_id = $${idx++}`);
    params.push(options.session_id);
  }
  if (options.chunk_id) {
    conditions.push(`a.chunk_id = $${idx++}`);
    params.push(options.chunk_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await sql(
    `SELECT a.id, a.chunk_id, a.note, a.tag, a.session_id, a.created_at,
            tc.content AS passage, ct.title, ct.author, tc.page_number
     FROM annotations a
     JOIN text_chunks tc ON a.chunk_id = tc.id
     JOIN canonical_texts ct ON tc.text_id = ct.id
     ${where}
     ORDER BY a.created_at DESC`,
    params,
  );

  return JSON.stringify(
    {
      total: rows.length,
      annotations: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        chunk_id: r.chunk_id,
        note: r.note,
        tag: r.tag,
        session_id: r.session_id,
        source: {
          title: r.title,
          author: r.author,
          page: r.page_number,
          passage_preview: (r.passage as string).slice(0, 150) + '...',
        },
        created_at: r.created_at,
      })),
    },
    null,
    2,
  );
}
