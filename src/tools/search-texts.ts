import type { z } from 'zod';
import { CHARACTER_LIMIT } from '../constants.js';
import type { SearchTextsInput } from '../schemas/tools.js';
import { getDb } from '../services/db.js';
import { generateEmbedding } from '../services/embeddings.js';

type SearchTextsParams = z.infer<typeof SearchTextsInput>;

export async function searchTexts(params: SearchTextsParams): Promise<string> {
  const sql = getDb();
  const queryEmbedding = await generateEmbedding(params.query);

  const conditions: string[] = [];
  const queryParams: unknown[] = [JSON.stringify(queryEmbedding), params.limit];
  let idx = 3;

  if (params.author) {
    conditions.push(`ct.author ILIKE $${idx}`);
    queryParams.push(`%${params.author}%`);
    idx++;
  }
  if (params.title) {
    conditions.push(`ct.title ILIKE $${idx}`);
    queryParams.push(`%${params.title}%`);
    idx++;
  }
  if (params.text_type) {
    conditions.push(`ct.text_type = $${idx}`);
    queryParams.push(params.text_type);
    idx++;
  }
  if (params.tradition) {
    conditions.push(`ct.tradition ILIKE $${idx}`);
    queryParams.push(`%${params.tradition}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const results = await sql(
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
    ${whereClause}
    ORDER BY tc.embedding <=> $1::vector
    LIMIT $2
  `,
    queryParams,
  );

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
    similarity: (r.similarity as number).toFixed(3),
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
