import { z } from 'zod';

export const SearchTextsInput = z
  .object({
    query: z
      .string()
      .min(2, 'Query must be at least 2 characters')
      .describe('Natural language search query for passage or concept'),
    mode: z
      .enum(['semantic', 'exact', 'hybrid'])
      .default('semantic')
      .describe(
        "Search mode. 'semantic' uses vector similarity (default). 'exact' uses full-text keyword matching. 'hybrid' combines both, ranking by a weighted blend.",
      ),
    author: z.string().optional().describe('Filter by author name'),
    title: z.string().optional().describe('Filter by work title'),
    text_type: z
      .enum(['literary_work', 'theory', 'criticism', 'article', 'dissertation'])
      .optional()
      .describe('Filter by source type'),
    tradition: z.string().optional().describe("Filter by critical tradition, e.g. 'queer theory', 'deconstruction'"),
    limit: z.number().int().min(1).max(20).default(5).describe('Max results to return'),
  })
  .strict();

export const LookupClaimsInput = z
  .object({
    theorist: z.string().optional().describe('Name of the theorist'),
    work_title: z.string().optional().describe('Title of the work'),
    keyword: z.string().optional().describe('Keyword to search claims by'),
    tradition: z.string().optional().describe('Critical tradition'),
    query: z.string().optional().describe('Free-text search across claim summaries'),
  })
  .strict();

export const QueryGraphInput = z
  .object({
    claim_id: z.string().uuid().optional().describe('UUID of a specific claim to find relationships for'),
    theorist: z.string().optional().describe('Find all relationships involving this theorist'),
    relation_type: z
      .enum([
        'critiques',
        'extends',
        'responds_to',
        'misreads',
        'applies',
        'historicizes',
        'synthesizes',
        'contradicts',
        'contextualizes',
      ])
      .optional()
      .describe('Filter by relationship type'),
    direction: z
      .enum(['outgoing', 'incoming', 'both'])
      .default('both')
      .describe('Direction of relationships to return'),
  })
  .strict();

export const VerifyCitationInput = z
  .object({
    doi: z.string().optional().describe('DOI of the work (most reliable identifier)'),
    title: z.string().describe('Title of the work'),
    author: z.string().optional().describe('Author name(s)'),
    year: z.number().int().optional().describe('Publication year'),
    journal: z.string().optional().describe('Journal name'),
  })
  .strict();

export const VerifyOutputInput = z
  .object({
    agent_output: z.string().describe('The full text output from the agent to verify'),
    session_id: z.string().describe('Session identifier for audit logging'),
  })
  .strict();

export const ProcureSourceInput = z
  .object({
    title: z.string().optional().describe('Title of the source to procure'),
    author: z.string().optional().describe('Author name(s)'),
    year: z.number().int().optional().describe('Publication year'),
    doi: z.string().optional().describe('DOI if known'),
    citation_id: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the citation record from a prior lit_verify_citation call'),
    file_path: z
      .string()
      .optional()
      .describe(
        'Absolute path to a PDF you have already downloaded. When provided, the source is ingested immediately.',
      ),
    text_type: z
      .enum(['literary_work', 'theory', 'criticism', 'article', 'dissertation'])
      .optional()
      .describe('Type of text (default: article)'),
    tradition: z.string().optional().describe('Critical tradition'),
    archive_to_paperless: z
      .boolean()
      .optional()
      .describe('Whether to archive the PDF to Paperless-ngx (default: true if configured)'),
  })
  .strict();

export const AddClaimInput = z
  .object({
    theorist: z.string().describe('Name of the theorist'),
    work_title: z.string().describe('Title of the work where the claim is made'),
    text_id: z.string().uuid().optional().describe('UUID of the canonical text in the corpus, if indexed'),
    year: z.number().int().optional().describe('Publication year'),
    chapter: z.string().optional().describe('Chapter title or number'),
    section: z.string().optional().describe('Section title or number'),
    page_range: z.string().optional().describe('Page range (e.g. "45-67")'),
    claim_summary: z.string().min(10).describe('Summary of the theoretical claim or argument'),
    source_passage: z.string().optional().describe('The exact source passage supporting this claim'),
    keywords: z.array(z.string()).default([]).describe('Keywords for indexing'),
    tradition: z.string().optional().describe('Critical tradition (e.g. deconstruction, queer theory)'),
    relation: z
      .object({
        target_claim_id: z.string().uuid().describe('UUID of the related claim'),
        type: z
          .enum([
            'critiques',
            'extends',
            'responds_to',
            'misreads',
            'applies',
            'historicizes',
            'synthesizes',
            'contradicts',
            'contextualizes',
          ])
          .describe('Type of relationship from this claim to the target'),
        notes: z.string().optional().describe('Notes about the relationship'),
      })
      .optional()
      .describe('Optionally create a relationship edge to an existing claim in the same call'),
  })
  .strict();

export const ExportBibliographyInput = z
  .object({
    citation_ids: z
      .array(z.string().uuid())
      .optional()
      .describe('Specific citation IDs to include. If omitted, exports all verified citations.'),
    style: z
      .enum(['mla', 'chicago', 'apa'])
      .default('chicago')
      .describe('Citation style format'),
    session_id: z
      .string()
      .optional()
      .describe('If provided, exports only citations referenced in this session\'s verification log'),
  })
  .strict();

export const AnnotateInput = z
  .object({
    chunk_id: z.string().uuid().describe('UUID of the text_chunk to annotate'),
    note: z.string().min(1).describe('The annotation text'),
    tag: z
      .string()
      .optional()
      .describe('A tag to categorize the annotation (e.g. "key-argument", "chapter-3", "needs-followup")'),
    session_id: z.string().optional().describe('Session identifier for grouping annotations'),
  })
  .strict();

export const ListLibraryInput = z
  .object({
    source: z
      .enum(['all', 'paperless', 'corpus'])
      .default('all')
      .describe(
        "Which catalog to return. 'paperless' returns only Paperless-ngx archived documents. 'corpus' returns only indexed corpus documents. 'all' merges both, deduplicating by title+author.",
      ),
    filter: z
      .object({
        author: z.string().optional().describe('Filter by author name (partial match, case-insensitive)'),
        title: z.string().optional().describe('Filter by title (partial match, case-insensitive)'),
        tag: z.string().optional().describe('Filter by Paperless-ngx tag (exact match)'),
        ingested_after: z
          .string()
          .optional()
          .describe('Only return documents ingested after this date (YYYY-MM-DD)'),
      })
      .optional()
      .describe('Optional filters to narrow the catalog'),
    limit: z.number().int().min(1).max(500).default(100).describe('Maximum number of entries to return'),
    offset: z.number().int().min(0).default(0).describe('Skip this many entries (for pagination)'),
  })
  .strict();

export const IngestPdfInput = z
  .object({
    file_path: z.string().describe('Absolute path to the PDF file to ingest'),
    author: z.string().optional().describe('Author name (extracted automatically if not provided)'),
    title: z.string().optional().describe('Work title (extracted automatically if not provided)'),
    year: z.number().int().optional().describe('Publication year'),
    text_type: z
      .enum(['literary_work', 'theory', 'criticism', 'article', 'dissertation'])
      .optional()
      .describe('Type of text (default: article)'),
    tradition: z.string().optional().describe('Critical tradition'),
    citation_id: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of an existing citation record to link and mark as indexed'),
  })
  .strict();
