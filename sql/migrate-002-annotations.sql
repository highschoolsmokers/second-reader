-- Migration 002: Add annotations table for passage bookmarking

CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES text_chunks(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  tag TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_chunk_id ON annotations(chunk_id);
CREATE INDEX IF NOT EXISTS idx_annotations_tag ON annotations(tag);
CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id);

-- Also add page_count and format columns to canonical_texts if missing
ALTER TABLE canonical_texts ADD COLUMN IF NOT EXISTS page_count INTEGER;
ALTER TABLE canonical_texts ADD COLUMN IF NOT EXISTS format TEXT;
