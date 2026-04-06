export interface CanonicalText {
  id: string;
  author: string;
  title: string;
  edition: string | null;
  year: number | null;
  publisher: string | null;
  isbn: string | null;
  text_type: 'literary_work' | 'theory' | 'criticism' | 'article' | 'dissertation';
  tradition: string | null;
}

export interface TextChunk {
  id: string;
  text_id: string;
  chapter_number: number | null;
  chapter_title: string | null;
  section_title: string | null;
  paragraph_index: number;
  page_number: number | null;
  page_range: string | null;
  content: string;
  similarity?: number;
}

export interface Claim {
  id: string;
  theorist: string;
  work_title: string;
  text_id: string | null;
  year: number | null;
  chapter: string | null;
  section: string | null;
  page_range: string | null;
  claim_summary: string;
  source_passage: string | null;
  keywords: string[];
  tradition: string | null;
}

export interface ClaimRelation {
  source_claim_id: string;
  target_claim_id: string;
  relation: ClaimRelationType;
  notes: string | null;
  // Joined fields
  source_theorist?: string;
  source_work?: string;
  source_claim?: string;
  target_theorist?: string;
  target_work?: string;
  target_claim?: string;
}

export type ClaimRelationType =
  | 'critiques'
  | 'extends'
  | 'responds_to'
  | 'misreads'
  | 'applies'
  | 'historicizes'
  | 'synthesizes'
  | 'contradicts'
  | 'contextualizes';

export interface Citation {
  id: string;
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  abstract: string | null;
  bibliographic_verified: boolean;
  verification_source: string | null;
  full_text_indexed: boolean;
  text_id: string | null;
}

export interface VerificationResult {
  original_text: string;
  confidence: 'verified' | 'plausible' | 'unverified' | 'flagged';
  reason: string;
  checks: {
    existence?: 'verified' | 'not_found';
    quotation?: { match: boolean; similarity: number; closest_passage?: string };
    argument_fidelity?: { faithful: boolean; analysis: string };
  };
}

export interface ProcurementItem {
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  doi: string | null;
  citation_id: string;
  reason: string;
}

export interface ExternalCitationResult {
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  abstract: string | null;
  source: 'crossref' | 'semantic_scholar' | 'openalex';
  crossref_data: unknown;
  semantic_scholar_data: unknown;
  openalex_data: unknown;
}
