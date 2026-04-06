export const QUOTATION_SIMILARITY_THRESHOLD = parseFloat(process.env.QUOTATION_SIMILARITY_THRESHOLD || '0.85');

export const CHARACTER_LIMIT = parseInt(process.env.CHARACTER_LIMIT || '8000', 10);

export const MAX_CITATIONS_PER_VERIFY = parseInt(process.env.MAX_CITATIONS_PER_VERIFY || '15', 10);
