import { z } from 'zod';

export const SearchTextsInput = z
  .object({
    query: z
      .string()
      .min(2, 'Query must be at least 2 characters')
      .describe('Natural language search query for passage or concept'),
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
