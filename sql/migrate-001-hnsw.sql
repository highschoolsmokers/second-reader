-- Migration: Switch IVFFlat to HNSW index + add composite claims index
-- HNSW doesn't require periodic reindexing after bulk inserts
-- Run this against an existing database that used the original schema

DROP INDEX IF EXISTS idx_text_chunks_embedding;

CREATE INDEX idx_text_chunks_embedding ON text_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS idx_claims_theorist_tradition ON claims(theorist, tradition);
