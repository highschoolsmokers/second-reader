import type { z } from 'zod';
import { CHARACTER_LIMIT } from '../constants.js';
import type { SearchTextsInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { generateEmbedding } from '../services/embeddings.js';

type SearchTextsParams = z.infer<typeof SearchTextsInput>;

function buildWhereClause(params: SearchTextsParams, startIdx: number): { clause: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = startIdx;

  if (params.author) {
    conditions.push(`ct.author ILIKE $${idx}`);
    values.push(`%${params.author}%`);
    idx++;
  }
  if (params.title) {
    conditions.push(`ct.title ILIKE $${idx}`);
    values.push(`%${params.title}%`);
    idx++;
  }
  if (params.text_type) {
    conditions.push(`ct.text_type = $${idx}`);
    values.push(params.text_type);
    idx++;
  }
  if (params.tradition) {
    conditions.push(`ct.tradition ILIKE $${idx}`);
    values.push(`%${params.tradition}%`);
    idx++;
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

async function semanticSearch(params: SearchTextsParams) {
  const sql = getDb();
  const queryEmbedding = await generateEmbedding(params.query);
  const { clause, values } = buildWhereClause(params, 3);

  return sql(
    `
    SELECT
      tc.content,
      tc.chapter_title,
      tc.section_title,
      tc.page_number,
      tc.page_range,
      ct.author,
      ct.title,
      ct.edition,
      ct.year,
      ct.text_type,
      1 - (tc.embedding <=> $1::vector) AS similarity
    FROM text_chunks tc
    JOIN canonical_texts ct ON tc.text_id = ct.id
    ${clause}
    ORDER BY tc.embedding <=> $1::vector
    LIMIT $2
  `,
    [JSON.stringify(queryEmbedding), params.limit, ...values],
  );
}

async function exactSearch(params: SearchTextsParams) {
  const sql = getDb();
  const { clause, values } = buildWhereClause(params, 3);

  // Add a ts_vector condition for the query
  const tsCondition = clause
    ? `${clause} AND to_tsvector('english', tc.content) @@ plainto_tsquery('english', $1)`
    : `WHERE to_tsvector('english', tc.content) @@ plainto_tsquery('english', $1)`;

  return sql(
    `
    SELECT
      tc.content,
      tc.chapter_title,
      tc.section_title,
      tc.page_number,
      tc.page_range,
      ct.author,
      ct.title,
      ct.edition,
      ct.year,
      ct.text_type,
      ts_rank(to_tsvector('english', tc.content), plainto_tsquery('english', $1)) AS similarity
    FROM text_chunks tc
    JOIN canonical_texts ct ON tc.text_id = ct.id
    ${tsCondition}
    ORDER BY ts_rank(to_tsvector('english', tc.content), plainto_tsquery('english', $1)) DESC
    LIMIT $2
  `,
    [params.query, params.limit, ...values],
  );
}

async function hybridSearch(params: SearchTextsParams) {
  const sql = getDb();
  const queryEmbedding = await generateEmbedding(params.query);
  const { clause, values } = buildWhereClause(params, 4);

  // Combine vector similarity (weight 0.7) with full-text rank (weight 0.3)
  const tsCondition = clause ? `${clause}` : '';

  return sql(
    `
    SELECT
      tc.content,
      tc.chapter_title,
      tc.section_title,
      tc.page_number,
      tc.page_range,
      ct.author,
      ct.title,
      ct.edition,
      ct.year,
      ct.text_type,
      (
        0.7 * (1 - (tc.embedding <=> $1::vector)) +
        0.3 * COALESCE(ts_rank(to_tsvector('english', tc.content), plainto_tsquery('english', $2)), 0)
      ) AS similarity
    FROM text_chunks tc
    JOIN canonical_texts ct ON tc.text_id = ct.id
    ${tsCondition}
    ORDER BY similarity DESC
    LIMIT $3
  `,
    [JSON.stringify(queryEmbedding), params.query, params.limit, ...values],
  );
}

export async function searchTexts(params: SearchTextsParams): Promise<string> {
  const mode = params.mode ?? 'semantic';

  let results: Record<string, unknown>[];
  if (mode === 'exact') {
    results = await exactSearch(params);
  } else if (mode === 'hybrid') {
    results = await hybridSearch(params);
  } else {
    results = await semanticSearch(params);
  }

  if (!results.length) {
    return 'No matching passages found in the indexed corpus. This text may not be indexed — do not quote from memory.';
  }

  const output = results.map((r: Record<string, unknown>) => ({
    author: r.author,
    title: r.title,
    edition: r.edition,
    year: r.year,
    chapter: r.chapter_title,
    section: r.section_title,
    page: r.page_number || r.page_range,
    passage: r.content,
    similarity: Number(r.similarity).toFixed(3),
    mode,
  }));

  const text = JSON.stringify(output, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    return (
      JSON.stringify(output.slice(0, 3), null, 2) +
      `\n\n[${output.length - 3} additional results truncated. Narrow your search.]`
    );
  }
  return text;
}
