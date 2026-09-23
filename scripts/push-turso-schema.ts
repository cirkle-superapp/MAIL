/**
 * Push the Prisma schema to Turso (libsql).
 *
 * Prisma CLI doesn't natively accept `libsql://` URLs for `db push`, so we
 * generate the DDL via `prisma migrate diff --from-empty --to-schema-datamodel`
 * and apply it here via the libsql client + Turso auth token.
 *
 * Usage:  bun run scripts/push-turso-schema.ts
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'

const TURSO_URL = process.env.TURSO_DATABASE_URL!
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env')
  process.exit(1)
}

const sql = readFileSync('/tmp/cirkle-schema.sql', 'utf8')

// Strip `-- comment` lines first, then split on `;`. Each non-empty chunk is
// one DDL statement. We execute them individually so a single failure doesn't
// abort the whole schema push.
const cleaned = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
const statements = cleaned
  .split(/;/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

async function main() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
  console.log(`Applying ${statements.length} statements to Turso at ${TURSO_URL}…`)
  let ok = 0
  let skipped = 0
  const errors: string[] = []
  for (const stmt of statements) {
    try {
      await client.execute(stmt)
      ok++
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      // "table already exists" is expected when re-running — treat as skipped.
      if (/already exists/i.test(msg)) {
        skipped++
      } else {
        errors.push(`${stmt.slice(0, 80)}… → ${msg.slice(0, 200)}`)
      }
    }
  }
  console.log(`Done. Applied: ${ok}. Skipped (already existed): ${skipped}. Errors: ${errors.length}.`)
  if (errors.length) {
    console.error('Errors:')
    for (const e of errors) console.error('  ' + e)
  }

  // Verify by counting tables.
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  console.log(`\nTables now on Turso (${tables.rows.length}):`)
  for (const row of tables.rows) {
    console.log('  - ' + (row as any).name)
  }
  client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
