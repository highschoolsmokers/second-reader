import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

// Voyage AI — optimized for academic and literary text
// Model: voyage-3 (1024 dimensions)

const VOYAGE_BATCH_LIMIT = 128;

function getVoyageKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY environment variable is required');
  return key;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_LIMIT) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_LIMIT);
    logger.debug('Generating embeddings batch', { batch_size: batch.length, offset: i, total: texts.length });

    const response = await fetchWithRetry(
      'https://api.voyageai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getVoyageKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'voyage-3',
          input: batch,
        }),
      },
      { timeoutMs: 30_000 },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage AI error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    allEmbeddings.push(...data.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}
