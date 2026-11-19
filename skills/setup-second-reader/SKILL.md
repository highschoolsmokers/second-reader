---
name: setup-second-reader
description: >
  Install and connect the second-reader MCP server so the lit_* tools are
  available: check prerequisites, install and build, create the .env and the
  pgvector schema, register the server (bundled with the plugin, or in
  .mcp.json for a standalone checkout), and confirm the
  connection with lit_list_library. Use when the user says "set up second
  reader", "install the MCP", "connect the corpus", or when another skill
  (start-essay, procure-sources) finds the lit_* tools missing. Not for
  ingesting texts; that is procure-sources and `npm run ingest`.
---

# setup-second-reader: install and connect the server

The other skills in this plugin work without the server but fall back to
manual archive checks. This skill gets the server running so they can verify
against the corpus instead.

## Preconditions

- Node.js 20 or later (`node --version`).
- A Neon Postgres database. The free tier works; the schema enables the
  `vector` extension itself.
- A Voyage AI API key (embeddings) and an Anthropic API key (the
  verification pipeline).
- The server code. Call its path `<repo>` below:
  - **Installed as a Claude Code plugin** (the usual case): `<repo>` is
    `${CLAUDE_PLUGIN_ROOT}`. The plugin already registers the
    `second-reader` MCP server, pointing at `<repo>/dist/index.js`; it only
    needs building and credentials.
  - **Standalone checkout** of
    `https://github.com/highschoolsmokers/second-reader`: `<repo>` is the
    checkout, and step 5 registers the server by hand.

## Handling secrets

The user supplies the database URL and API keys. Never print them, echo
them back, or `cat` a file that holds them (`.env`, `.mcp.json`). To check a
value is set, print whether it exists, not what it is:

```bash
grep -c '^VOYAGE_API_KEY=.' <env file>
```

In a checkout, `.env` and `.mcp.json` are gitignored. Keep them that way.

## Steps

### 1. Check whether it is already connected

If `lit_list_library` is available, call it. A response (even an empty
library) means setup is done; stop and report that. Otherwise continue.

### 2. Install and build

```bash
cd <repo>
npm install
npm run build
```

The build writes `dist/index.js`, which is what the MCP config runs.

For a plugin install this is a one-time step per plugin version: a plugin
update replaces `${CLAUDE_PLUGIN_ROOT}`, so rerun it after updating.

### 3. Create `.env`

Where it goes:

- **Plugin install:** `~/.config/second-reader/.env`. Not inside
  `${CLAUDE_PLUGIN_ROOT}`, which is replaced on every plugin update.
- **Standalone checkout:** `<repo>/.env`.

```bash
mkdir -p ~/.config/second-reader
cp <repo>/.env.example ~/.config/second-reader/.env   # or <repo>/.env
```

Then fill in the three required values: `DATABASE_URL`,
`ANTHROPIC_API_KEY`, and `VOYAGE_API_KEY`. Ask the user to paste them into
the file themselves, or to give them to you to write; do not invent
placeholders that look real.

`.env.example` also lists every optional setting, commented out at its
default. The server reads the first of these that defines each key
(values already in the process environment always win):
`$SECOND_READER_ENV_PATH`, `~/.config/second-reader/.env`, `<repo>/.env`,
then `./.env` in its working directory.

### 4. Create the schema

`setup-db` loads `./.env` itself. For the `~/.config` location, pass the
file in:

```bash
cd <repo>
npm run setup-db                                                   # <repo>/.env
npx tsx --env-file=$HOME/.config/second-reader/.env scripts/setup-db.ts   # plugin install
```

It applies `sql/schema.sql`, then any `sql/migrate-*.sql` not yet recorded
in the `schema_migrations` table. Each statement prints `OK` or
`SKIP (exists)`. Re-running is safe. A `FAIL` line stops the run and usually
means the database URL or permissions are wrong. Show the user
the error message, check it for the URL or password first, and stop.

### 5. Register the server with Claude Code

**Plugin install:** skip this step; the plugin registers the server.

**Standalone checkout:** add a `second-reader` entry to the `.mcp.json` of the project where the user
will write, using `.mcp.json.example` in the repo as the template. Set
`cwd` to the absolute path of `<repo>`, and pass the three keys through
`env`, either as values or as `${VAR}` references to the user's shell
environment.

```json
{
  "mcpServers": {
    "second-reader": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/second-reader",
      "env": {
        "DATABASE_URL": "${SECOND_READER_DATABASE_URL}",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "VOYAGE_API_KEY": "${VOYAGE_API_KEY}",
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

If that project's `.mcp.json` is not gitignored and holds literal keys, tell
the user before saving it.

### 6. Restart and confirm

Ask the user to restart Claude Code (or reconnect MCP servers) and approve
the `second-reader` server when prompted. Then call `lit_list_library`. The
server exposes eleven `lit_*` tools; a response from `lit_list_library`
confirms the database connection as well.

## If it fails

- **Tools do not appear:** confirm `dist/index.js` exists under `<repo>`
  (for a plugin, `${CLAUDE_PLUGIN_ROOT}`; for a checkout, the `cwd` in
  `.mcp.json`), then run `node dist/index.js` from `<repo>`. It should log
  `Second Reader running on stdio` and wait for input.
- **Tools appear but calls fail with a database error:** a value set in
  `.mcp.json` `env` wins; `.env` only fills values that are not already set.
  Check that the URL the server actually gets points at the database from
  step 4, and that step 4 succeeded.
- **Verification calls fail with an auth error:** check `ANTHROPIC_API_KEY`
  and `VOYAGE_API_KEY` with the existence check above.

## Next

With the server connected, offer `procure-sources` to fill the corpus or
`start-essay` to begin a project.
