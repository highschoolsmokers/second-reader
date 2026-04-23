// Load .env before anything else so downstream imports see the values.
// Priority: (1) SECOND_READER_ENV_PATH if set, (2) ~/workspace/second-reader/.env,
// (3) ./.env in the current working directory. Silent if none exist — callers
// that set the env vars via their shell or process manager still work.
import 'dotenv/config';
import dotenv from 'dotenv';
import os from 'node:os';
import path from 'node:path';
const envCandidates = [
  process.env.SECOND_READER_ENV_PATH,
  process.env.LIT_VERITY_ENV_PATH, // legacy name, kept for back-compat
  path.join(os.homedir(), 'workspace/second-reader/.env'),
  path.join(os.homedir(), 'workspace/lit-verity-mcp/.env'), // legacy path
].filter(Boolean) as string[];
for (const p of envCandidates) {
  dotenv.config({ path: p, override: false });
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import {
  AddClaimInput,
  AnnotateInput,
  ExportBibliographyInput,
  IngestPdfInput,
  ListLibraryInput,
  LookupClaimsInput,
  ProcureSourceInput,
  QueryGraphInput,
  SearchTextsInput,
  VerifyCitationInput,
  VerifyOutputInput,
} from './schemas/tools.js';
import { getDb } from './services/db.js';
import { logger } from './services/logger.js';
import { addClaim } from './tools/add-claim.js';
import { annotate } from './tools/annotate.js';
import { exportBibliography } from './tools/export-bibliography.js';
import { ingestPdf } from './tools/ingest-pdf.js';
import { listLibrary } from './tools/list-library.js';
import { lookupClaims } from './tools/lookup-claims.js';
import { procureSource } from './tools/procure-source.js';
import { queryGraph } from './tools/query-graph.js';
import { searchTexts } from './tools/search-texts.js';
import { verifyCitation } from './tools/verify-citation.js';
import { verifyOutput } from './tools/verify-output.js';

const server = new McpServer({
  name: 'second-reader',
  version: '1.1.0',
});

// ============================================================
// TOOLS
// ============================================================

server.registerTool(
  'lit_search_texts',
  {
    title: 'Search Indexed Texts',
    description: `Search indexed literary works, theoretical texts, and critical articles. Returns matching passages with full bibliographic metadata and page numbers.

Use this to retrieve quotations and source passages — NEVER quote from memory. If a text is not in the corpus, this tool will tell you.

Args:
  - query (string): Natural language search query
  - mode (enum, optional): 'semantic' (vector similarity, default) | 'exact' (full-text keyword match) | 'hybrid' (weighted blend of both). Use 'exact' for specific phrases, 'semantic' for conceptual search.
  - author (string, optional): Filter by author name
  - title (string, optional): Filter by work title
  - text_type (enum, optional): 'literary_work' | 'theory' | 'criticism' | 'article' | 'dissertation'
  - tradition (string, optional): Filter by critical tradition
  - limit (number, optional): Max results, 1-20, default 5

Returns: JSON array of matching passages with author, title, edition, year, chapter, page, passage text, similarity score, and search mode used.`,
    inputSchema: SearchTextsInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await searchTexts(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_list_library',
  {
    title: 'List Library Catalog',
    description: `Returns a catalog of all documents in the writer's Paperless-ngx archive and/or the indexed corpus. Use this to discover what the writer already has access to at the start of a session.

Args:
  - source (enum, optional): 'all' | 'paperless' | 'corpus' (default: 'all')
  - filter (object, optional): { author, title, tag, ingested_after }
  - limit (number, optional): Max results, 1-500, default 100
  - offset (number, optional): Skip entries for pagination, default 0

Returns: JSON with total count and array of document entries including id, title, author, year, source location, indexing status, tags, and format.`,
    inputSchema: ListLibraryInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await listLibrary(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_lookup_claims',
  {
    title: 'Lookup Theoretical Claims',
    description: `Query the claims database for documented theoretical and critical arguments. Returns structured records with theorist, work, claim summary, source passage, and keywords.

Use this to verify what a theorist actually argued before characterizing their position. If no record exists, mark your characterization as UNVERIFIED.

Args:
  - theorist (string, optional): Name of the theorist
  - work_title (string, optional): Title of the work
  - keyword (string, optional): Keyword to search by
  - tradition (string, optional): Critical tradition
  - query (string, optional): Free-text search across summaries

Returns: JSON array of claim records.`,
    inputSchema: LookupClaimsInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await lookupClaims(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_query_graph',
  {
    title: 'Query Claims Relationship Graph',
    description: `Traverse the claims relationship graph. Find how theoretical arguments relate to each other — who critiques, extends, responds to, or misreads whom.

Use this to verify claimed relationships between theorists or positions. If no edge exists, note the relationship is your INFERENCE, not a verified connection.

Args:
  - claim_id (UUID, optional): Specific claim to find relationships for
  - theorist (string, optional): Find relationships involving this theorist
  - relation_type (enum, optional): Filter by relationship type
  - direction (enum, optional): 'outgoing' | 'incoming' | 'both' (default: 'both')

Returns: JSON array of relationships with source/target theorist, work, claim, and relation type.`,
    inputSchema: QueryGraphInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await queryGraph(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_verify_citation',
  {
    title: 'Verify Bibliographic Citation',
    description: `Verify that a scholarly citation exists. Checks local cache first, then queries CrossRef, Semantic Scholar, and OpenAlex APIs.

Use this for EVERY citation before including it in your response. If verification fails, DO NOT include the citation — mark it as FLAGGED.

Args:
  - doi (string, optional): DOI (most reliable identifier)
  - title (string, required): Title of the work
  - author (string, optional): Author name(s)
  - year (number, optional): Publication year
  - journal (string, optional): Journal name

Returns: JSON with status ('verified' | 'not_found'), citation data, and whether full text is available.`,
    inputSchema: VerifyCitationInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => {
    const result = await verifyCitation(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_verify_output',
  {
    title: 'Verify Agent Output',
    description: `Post-generation verification pipeline. Extracts all citations, quotations, and argument characterizations from the agent's output and checks each against the truth model.

Returns per-claim confidence tags (verified/plausible/unverified/flagged) and a list of sources that need procurement for full verification.

Args:
  - agent_output (string): The full text to verify
  - session_id (string): Session identifier for audit trail

Returns: JSON with summary counts, per-claim results, and procurement queue.`,
    inputSchema: VerifyOutputInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params) => {
    const result = await verifyOutput(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_ingest_pdf',
  {
    title: 'Ingest PDF into Corpus',
    description: `Ingest a PDF file into the indexed corpus. Extracts text, chunks it, generates embeddings, and creates a canonical_texts record. Optionally links to an existing citation.

Use this to add new sources during a research session — closes the procurement loop without leaving the MCP client.

Args:
  - file_path (string): Absolute path to the PDF file
  - author (string, optional): Author name (auto-extracted if omitted)
  - title (string, optional): Work title (auto-extracted if omitted)
  - year (number, optional): Publication year
  - text_type (enum, optional): Source type (default: article)
  - tradition (string, optional): Critical tradition
  - citation_id (UUID, optional): Link to existing citation record

Returns: JSON with indexing results including text_id, chunk count, and linkage status.`,
    inputSchema: IngestPdfInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await ingestPdf(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_procure_source',
  {
    title: 'Procure Source for Verification',
    description: `Two-phase tool for procuring sources that are behind paywalls or not yet indexed.

**Phase 1 — Search:** Call with title/author/doi/citation_id (no file_path). The tool will:
  1. Check if the source is already in the corpus
  2. Search your Paperless-ngx archive (if configured) and auto-ingest if found
  3. If not found, return access links (DOI, Google Scholar, JSTOR, Academia.edu) and ask the user to download the PDF

**Phase 2 — Ingest:** Call again with file_path pointing to the downloaded PDF. The tool will:
  1. Ingest the PDF into the corpus (text extraction, chunking, embeddings)
  2. Archive the PDF to Paperless-ngx (if configured)
  3. Link to the existing citation record
  4. Mark the procurement queue entry as acquired

Use this whenever lit_verify_citation returns full_text_available: false or when you need to verify a quotation/argument but the source is not indexed.

Args:
  - title (string, optional): Source title
  - author (string, optional): Author name(s)
  - year (number, optional): Publication year
  - doi (string, optional): DOI if known
  - citation_id (UUID, optional): Citation record UUID from lit_verify_citation
  - file_path (string, optional): Path to downloaded PDF (triggers Phase 2)
  - text_type (enum, optional): Source type
  - tradition (string, optional): Critical tradition
  - archive_to_paperless (boolean, optional): Archive to Paperless-ngx (default: true)

Returns: JSON with status, source details, access links, or ingestion results.`,
    inputSchema: ProcureSourceInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params) => {
    const result = await procureSource(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_add_claim',
  {
    title: 'Add Theoretical Claim',
    description: `Record a verified theoretical claim into the claims database. Use this during research sessions to grow the claims graph as you verify arguments.

Optionally creates a relationship edge to an existing claim in the same call.

Args:
  - theorist (string): Name of the theorist
  - work_title (string): Title of the work
  - text_id (UUID, optional): Corpus text ID if indexed
  - year (number, optional): Publication year
  - chapter (string, optional): Chapter title or number
  - section (string, optional): Section title or number
  - page_range (string, optional): Page range
  - claim_summary (string): Summary of the claim (min 10 chars)
  - source_passage (string, optional): Exact supporting passage
  - keywords (string[], optional): Keywords for indexing
  - tradition (string, optional): Critical tradition
  - relation (object, optional): { target_claim_id, type, notes } to create a graph edge

Returns: JSON with claim_id and creation status.`,
    inputSchema: AddClaimInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await addClaim(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_export_bibliography',
  {
    title: 'Export Formatted Bibliography',
    description: `Generate a formatted bibliography from verified citations. Supports MLA, Chicago, and APA styles.

Args:
  - citation_ids (UUID[], optional): Specific citations to include. If omitted, exports all verified.
  - style (enum, optional): 'mla' | 'chicago' | 'apa' (default: 'chicago')
  - session_id (string, optional): Export only citations from this verification session

Returns: JSON with formatted bibliography text and per-entry data.`,
    inputSchema: ExportBibliographyInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await exportBibliography(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'lit_annotate',
  {
    title: 'Annotate Passage',
    description: `Create a bookmark/annotation on a specific text passage (text_chunk). Use this to mark key passages during research — "key argument for chapter 3", "contradicts earlier claim", etc.

Args:
  - chunk_id (UUID): The text_chunk ID to annotate
  - note (string): The annotation text
  - tag (string, optional): Category tag (e.g. "key-argument", "chapter-3", "needs-followup")
  - session_id (string, optional): Session identifier for grouping

Returns: JSON with annotation ID, source context, and passage preview.`,
    inputSchema: AnnotateInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params) => {
    const result = await annotate(params);
    return { content: [{ type: 'text', text: result }] };
  },
);

// ============================================================
// PROMPTS
// ============================================================

server.prompt(
  'analyze-argument',
  "Guided workflow to analyze and verify a theorist's argument with full source grounding",
  {
    theorist: z.string().describe('Name of the theorist to analyze'),
    topic: z.string().describe('The argument or concept to analyze'),
  },
  async ({ theorist, topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze ${theorist}'s argument about ${topic}. Follow this protocol:

1. Use lit_lookup_claims to find documented claims by ${theorist} related to "${topic}"
2. Use lit_query_graph to find how this argument relates to other theorists' positions
3. Use lit_search_texts to find the specific passages where ${theorist} makes this argument
4. For any citations you reference, use lit_verify_citation to confirm they exist

Tag every claim with its confidence level: VERIFIED, PLAUSIBLE, UNVERIFIED, or INFERENCE.
Distinguish clearly between what the sources document and what you infer.`,
        },
      },
    ],
  }),
);

server.prompt(
  'compare-theorists',
  "Compare two theorists' positions on a topic using verified sources",
  {
    theorist_a: z.string().describe('First theorist'),
    theorist_b: z.string().describe('Second theorist'),
    topic: z.string().describe('Shared topic or concept'),
  },
  async ({ theorist_a, theorist_b, topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Compare ${theorist_a} and ${theorist_b} on "${topic}". Follow this protocol:

1. Use lit_lookup_claims for each theorist to find their documented positions on "${topic}"
2. Use lit_query_graph to check for direct relationships between their claims (critiques, extends, responds_to, etc.)
3. Use lit_search_texts to find relevant passages from each theorist
4. Verify all citations with lit_verify_citation

Structure your comparison as:
- ${theorist_a}'s position (with VERIFIED source passages)
- ${theorist_b}'s position (with VERIFIED source passages)
- Points of convergence and divergence
- Documented intellectual relationships (from the graph)
- Your analysis (clearly marked as INFERENCE)`,
        },
      },
    ],
  }),
);

server.prompt(
  'verify-essay',
  'Run full verification on a completed essay or response',
  { session_id: z.string().describe('Session ID for audit trail') },
  async ({ session_id }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I'm going to paste an essay or response for verification. Use lit_verify_output with session_id "${session_id}" to check every citation, quotation, and argument characterization. Then provide a summary of what is verified, what is plausible, and what is flagged.

For any FLAGGED items, suggest corrections or note that the claim should be removed.
For any sources in the procurement queue, note them for future indexing.`,
        },
      },
    ],
  }),
);

// ============================================================
// RESOURCES
// ============================================================

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

// ============================================================
// TRANSPORT + GRACEFUL SHUTDOWN
// ============================================================

let httpServer: ReturnType<ReturnType<typeof express>['listen']> | null = null;

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    if (httpServer) {
      httpServer.close(() => logger.info('HTTP server closed'));
    }

    await server.close();
    logger.info('MCP server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Second Reader running on stdio');
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const { healthCheck } = await import('./services/db.js');
    const dbOk = await healthCheck();
    res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk });
  });

  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  const certPath = process.env.SSL_CERT_PATH;
  const keyPath = process.env.SSL_KEY_PATH;

  if (certPath && keyPath) {
    const { createServer } = await import('node:https');
    const { readFileSync } = await import('node:fs');
    const cert = readFileSync(certPath);
    const key = readFileSync(keyPath);
    httpServer = createServer({ cert, key }, app).listen(port, () => {
      logger.info(`Second Reader running on https://localhost:${port}/mcp`);
    }) as unknown as ReturnType<ReturnType<typeof express>['listen']>;
  } else {
    httpServer = app.listen(port, () => {
      logger.info(`Second Reader running on http://localhost:${port}/mcp`);
    });
  }
}

setupGracefulShutdown();

const transport = process.env.TRANSPORT || 'stdio';
if (transport === 'http') {
  runHTTP().catch((err) => {
    logger.error('Startup failed', { error: String(err) });
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    logger.error('Startup failed', { error: String(err) });
    process.exit(1);
  });
}
