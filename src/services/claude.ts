import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  stop_details?: { category?: string | null } | null;
}

const DEFAULT_MODEL = 'claude-sonnet-5-5';

function getModel(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

// The callers make short JSON-extraction requests with small max_tokens
// (300-2000). On the default model, turn extended thinking off so the whole
// budget goes to the reply; thinking tokens count toward max_tokens.
// `between_tools` exists only on claude-sonnet-5-5, so a CLAUDE_MODEL
// override gets a plain request.
function modelOptions(model: string): Record<string, unknown> {
  if (model !== DEFAULT_MODEL) return {};
  return {
    thinking: { type: 'between_tools' },
    output_config: { effort: 'low' },
  };
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is required');
  return key;
}

export async function callClaude(messages: ClaudeMessage[], maxTokens: number = 1000): Promise<string> {
  const model = getModel();
  logger.debug('Calling Claude', { model, maxTokens });

  const response = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
        ...modelOptions(model),
      }),
    },
    { timeoutMs: 60_000 },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as ClaudeResponse;

  // A refusal is an HTTP 200 with no usable text, and a max_tokens stop cuts
  // the JSON off. Callers already fall back when parsing fails; log why.
  if (data.stop_reason === 'refusal') {
    logger.warn('Claude declined the request', {
      model,
      category: data.stop_details?.category ?? null,
    });
  } else if (data.stop_reason === 'max_tokens') {
    logger.warn('Claude response hit max_tokens before finishing', { model, maxTokens });
  }

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}
