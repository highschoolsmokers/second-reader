-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- CANONICAL TEXTS
-- Literary works, theoretical texts, critical articles
-- ============================================================
CREATE TABLE canonical_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  edition TEXT,
  year INTEGER,
  publisher TEXT,
  isbn TEXT,
  text_type TEXT NOT NULL CHECK (text_type IN (
    'literary_work', 'theory', 'criticism', 'article', 'dissertation'
  )),
  tradition TEXT,
  page_count INTEGER,
  format TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_canonical_texts_author ON canonical_texts(author);
CREATE INDEX idx_canonical_texts_type ON canonical_texts(text_type);
CREATE INDEX idx_canonical_texts_tradition ON canonical_texts(tradition);

-- ============================================================
-- TEXT CHUNKS
-- Paragraphs/sections with embeddings for semantic search
-- ============================================================
CREATE TABLE text_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_id UUID NOT NULL REFERENCES canonical_texts(id) ON DELETE CASCADE,
  chapter_number INTEGER,
  chapter_title TEXT,
  section_title TEXT,
  paragraph_index INTEGER NOT NULL,
  page_number INTEGER,
  page_range TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_text_chunks_text_id ON text_chunks(text_id);

-- HNSW index: no reindex needed after inserts, better recall than IVFFlat
CREATE INDEX idx_text_chunks_embedding ON text_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);

-- ============================================================
-- CLAIMS
-- Structured records of theoretical/critical arguments
-- ============================================================
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theorist TEXT NOT NULL,
  work_title TEXT NOT NULL,
  text_id UUID REFERENCES canonical_texts(id),
  year INTEGER,
  chapter TEXT,
  section TEXT,
  page_range TEXT,
  claim_summary TEXT NOT NULL,
  source_passage TEXT,
  keywords TEXT[] DEFAULT '{}',
  tradition TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claims_theorist ON claims(theorist);
CREATE INDEX idx_claims_tradition ON claims(tradition);
CREATE INDEX idx_claims_keywords ON claims USING GIN(keywords);
CREATE INDEX idx_claims_theorist_tradition ON claims(theorist, tradition);

-- ============================================================
-- CLAIM RELATIONS (Graph Edges)
-- ============================================================
CREATE TYPE claim_relation_type AS ENUM (
  'critiques', 'extends', 'responds_to', 'misreads',
  'applies', 'historicizes', 'synthesizes',
  'contradicts', 'contextualizes'
);

CREATE TABLE claim_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  target_claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  relation claim_relation_type NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_claim_id, target_claim_id, relation)
);

CREATE INDEX idx_claim_relations_source ON claim_relations(source_claim_id);
CREATE INDEX idx_claim_relations_target ON claim_relations(target_claim_id);

-- ============================================================
-- CITATIONS (Bibliographic Records + Cache)
-- ============================================================
CREATE TABLE citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doi TEXT UNIQUE,
  title TEXT NOT NULL,
  authors TEXT[] NOT NULL,
  year INTEGER,
  journal TEXT,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  publisher TEXT,
  isbn TEXT,
  url TEXT,
  abstract TEXT,

  bibliographic_verified BOOLEAN DEFAULT FALSE,
  verification_source TEXT,
  verified_at TIMESTAMPTZ,

  full_text_indexed BOOLEAN DEFAULT FALSE,
  text_id UUID REFERENCES canonical_texts(id),
  source_file_id UUID,

  crossref_data JSONB,
  semantic_scholar_data JSONB,
  openalex_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_citations_doi ON citations(doi);
CREATE INDEX idx_citations_authors ON citations USING GIN(authors);
CREATE INDEX idx_citations_verified ON citations(bibliographic_verified);
CREATE INDEX idx_citations_indexed ON citations(full_text_indexed);

-- ============================================================
-- SOURCE FILES (Uploaded PDFs)
-- ============================================================
CREATE TYPE processing_status AS ENUM (
  'uploaded', 'extracting', 'chunking', 'embedding', 'indexed', 'failed'
);

CREATE TABLE source_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'application/pdf',
  citation_id UUID REFERENCES citations(id),
  text_id UUID REFERENCES canonical_texts(id),
  processing_status processing_status DEFAULT 'uploaded',
  processing_error TEXT,
  page_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ============================================================
-- VERIFICATION LOG (Audit Trail)
-- ============================================================
CREATE TABLE verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN (
    'citation_existence', 'quotation_match',
    'argument_fidelity', 'attribution'
  )),
  input_claim TEXT NOT NULL,
  reference_source TEXT,
  result TEXT NOT NULL CHECK (result IN (
    'verified', 'plausible', 'unverified', 'flagged'
  )),
  confidence_score FLOAT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_log_session ON verification_log(session_id);
CREATE INDEX idx_verification_log_result ON verification_log(result);

-- ============================================================
-- PROCUREMENT QUEUE (Sources Needed)
-- ============================================================
CREATE TABLE procurement_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_id UUID REFERENCES citations(id),
  title TEXT NOT NULL,
  authors TEXT[],
  journal TEXT,
  year INTEGER,
  doi TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acquired', 'unavailable', 'dismissed')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_procurement_queue_status ON procurement_queue(status);

-- ============================================================
-- ANNOTATIONS (Passage bookmarks and notes)
-- ============================================================
CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES text_chunks(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  tag TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_annotations_chunk_id ON annotations(chunk_id);
CREATE INDEX idx_annotations_tag ON annotations(tag);
CREATE INDEX idx_annotations_session ON annotations(session_id);
