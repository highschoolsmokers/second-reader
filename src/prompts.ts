import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** Guided multi-tool workflows exposed as MCP prompts. */
export function registerPrompts(server: McpServer): void {
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
}
