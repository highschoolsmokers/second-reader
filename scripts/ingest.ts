import { neon } from '@neondatabase/serverless';
import { extractPdfText, chunkText } from '../src/services/pdf.js';
import { generateEmbedding } from '../src/services/embeddings.js';
import { callClaude } from '../src/services/claude.js';

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error(`
Usage: tsx scripts/ingest.ts <pdf-path> [options]

Options:
  --citation-id <uuid>    Link to an existing citation record
  --type <text_type>      literary_work | theory | criticism | article | dissertation
  --author <name>         Override extracted author
  --title <name>          Override extracted title
  --year <number>         Override extracted year
  --tradition <name>      Critical tradition tag
  --suggest-claims        Use Claude to suggest key claims for review

Example:
  tsx scripts/ingest.ts ./uploads/sedgwick-paranoid-reading.pdf \\
    --type article --tradition "queer theory" --suggest-claims
`);
  process.exit(1);
}

const filePath = args[0];
const options: Record<string, string | boolean> = {};
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    if (args[i + 1] && !args[i + 1].startsWith('--')) {
      options[key] = args[i + 1];
      i++;
    } else {
      options[key] = true;
    }
  }
}

async function ingest(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`Extracting text from ${filePath}...`);
  const { text, pageCount } = await extractPdfText(filePath);
  console.log(`Extracted ${text.length} chars from ${pageCount} pages.`);

  // Determine metadata
  let author = options.author as string | undefined;
  let title = options.title as string | undefined;
  let year = options.year ? parseInt(options.year as string) : undefined;
  const textType = (options.type as string) || 'article';
  const tradition = options.tradition as string | undefined;

  if (!author || !title) {
    console.log('Extracting metadata with Claude...');
    const metadataResponse = await callClaude([{
      role: 'user',
      content: `Extract metadata from this academic text. Return ONLY JSON:
{"author": "...", "title": "...", "year": null or number}

Text (first 3000 chars):
${text.slice(0, 3000)}`,
    }], 500);

    const metadata = JSON.parse(metadataResponse.replace(/```json|```/g, '').trim());
    author = author || metadata.author;
    title = title || metadata.title;
    year = year || metadata.year;
  }

  console.log(`\nMetadata:\n  Author: ${author}\n  Title: ${title}\n  Year: ${year}\n  Type: ${textType}`);

  // Create canonical_texts record
  const [textRecord] = await sql(`
    INSERT INTO canonical_texts (author, title, year, text_type, tradition)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [author, title, year, textType, tradition]);

  const textId = textRecord.id as string;
  console.log(`Created canonical text: ${textId}`);

  // Link to citation if provided
  if (options['citation-id']) {
    await sql(`
      UPDATE citations SET text_id = $1, full_text_indexed = TRUE, updated_at = NOW()
      WHERE id = $2
    `, [textId, options['citation-id']]);

    await sql(`
      UPDATE procurement_queue SET status = 'acquired', resolved_at = NOW()
      WHERE citation_id = $1
    `, [options['citation-id']]);

    console.log(`Linked to citation ${options['citation-id']}`);
  }

  // Create source_files record
  await sql(`
    INSERT INTO source_files (filename, file_path, page_count, text_id, processing_status)
    VALUES ($1, $2, $3, $4, 'chunking')
  `, [filePath.split('/').pop(), filePath, pageCount, textId]);

  // Chunk and embed
  const chunks = chunkText(text);
  console.log(`Created ${chunks.length} chunks. Generating embeddings...`);

  for (let i = 0; i < chunks.length; i++) {
    if (i % 10 === 0) console.log(`  Embedding chunk ${i + 1}/${chunks.length}...`);
    const embedding = await generateEmbedding(chunks[i].text);
    await sql(`
      INSERT INTO text_chunks (text_id, paragraph_index, page_number, content, embedding)
      VALUES ($1, $2, $3, $4, $5)
    `, [textId, chunks[i].paragraphIndex, chunks[i].estimatedPage, chunks[i].text, JSON.stringify(embedding)]);
  }

  console.log('Indexing complete.');

  // Suggest claims
  if (options['suggest-claims']) {
    console.log('\nExtracting key claims with Claude...');
    const claimsResponse = await callClaude([{
      role: 'user',
      content: `Identify the 5-10 most important theoretical arguments or claims made in this text. For each, provide:
- "claim_summary": a 1-2 sentence summary of the argument
- "source_passage": the most relevant passage supporting it (under 200 words)
- "keywords": 3-5 keywords
- "chapter" or "section": where in the text this appears

Return ONLY a JSON array.

Author: ${author}
Title: ${title}

Full text (first 15000 chars):
${text.slice(0, 15000)}`,
    }], 4000);

    try {
      const suggestions = JSON.parse(claimsResponse.replace(/```json|```/g, '').trim());
      console.log(`\n${'='.repeat(60)}`);
      console.log('SUGGESTED CLAIMS — Review and confirm before adding');
      console.log('='.repeat(60));

      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        console.log(`\n[${i + 1}] ${s.claim_summary}`);
        console.log(`    Keywords: ${s.keywords?.join(', ')}`);
        console.log(`    Section: ${s.chapter || s.section || 'N/A'}`);
        console.log(`    Passage: ${(s.source_passage || '').slice(0, 150)}...`);
      }

      console.log(`\nTo add these claims, run:`);
      console.log(`  tsx scripts/seed-claims.ts --from-suggestions --text-id ${textId}`);

      // Save suggestions for later import
      const { writeFile } = await import('fs/promises');
      const suggestionsPath = `./evals/results/claim-suggestions-${textId.slice(0, 8)}.json`;
      await writeFile(suggestionsPath, JSON.stringify({
        text_id: textId,
        author,
        title,
        suggestions,
      }, null, 2));
      console.log(`Suggestions saved to ${suggestionsPath}`);

    } catch {
      console.error('Failed to parse claim suggestions.');
    }
  }
}

ingest();
