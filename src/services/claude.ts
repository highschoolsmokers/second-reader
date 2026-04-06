import { fetchWithRetry } from './fetch-retry.js';
import { logger } from './logger.js';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function getModel(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
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
      }),
    },
    { timeoutMs: 60_000 },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as ClaudeResponse;
  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
