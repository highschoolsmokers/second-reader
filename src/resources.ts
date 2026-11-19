import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDb } from './services/db.js';

/** Read-only corpus views exposed as MCP resources. */
export function registerResources(server: McpServer): void {
  server.resource('lit://stats', 'lit://stats', async (uri) => {
    const sql = getDb();
    const [texts] = await sql(`SELECT COUNT(*) AS count FROM canonical_texts`);
    const [chunks] = await sql(`SELECT COUNT(*) AS count FROM text_chunks`);
    const [claims] = await sql(`SELECT COUNT(*) AS count FROM claims`);
    const [relations] = await sql(`SELECT COUNT(*) AS count FROM claim_relations`);
    const [citations] = await sql(`SELECT COUNT(*) AS count FROM citations WHERE bibliographic_verified = TRUE`);
    const [indexed] = await sql(`SELECT COUNT(*) AS count FROM citations WHERE full_text_indexed = TRUE`);

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              canonical_texts: texts.count,
              text_chunks: chunks.count,
              claims: claims.count,
              claim_relations: relations.count,
              verified_citations: citations.count,
              fully_indexed_sources: indexed.count,
            },
            null,
            2,
          ),
        },
      ],
    };
  });

  server.resource('lit://procurement', 'lit://procurement', async (uri) => {
    const sql = getDb();
    const pending = await sql(`
        SELECT title, authors, journal, year, doi, reason, requested_at
        FROM procurement_queue
        WHERE status = 'pending'
        ORDER BY requested_at DESC
      `);

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              pending_count: pending.length,
              items: pending,
            },
            null,
            2,
          ),
        },
      ],
    };
  });
}
