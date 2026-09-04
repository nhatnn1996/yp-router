import { TABLES, buildCreateTableSqlPg, SCHEMA_VERSION } from "./schema.js";
import { MIGRATIONS, latestVersion } from "./migrations/index.js";
import { getAppVersion } from "./version.js";

// Track per-adapter so reusing same adapter skips re-run, but new adapter (after reset) re-runs.
const _migratedAdapters = new WeakSet();

// ─── Async meta helpers (for migration context) ─────────────────────────
async function getMetaAsync(adapter, key, fallback = null) {
  const row = await adapter.get(`SELECT value FROM _meta WHERE key = ?`, [key]);
  return row ? row.value : fallback;
}
async function setMetaAsync(adapter, key, value) {
  await adapter.run(`INSERT INTO _meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, String(value)]);
}

async function isFreshDb(adapter) {
  // Table _meta may not exist yet on truly fresh DB
  try {
    const row = await adapter.get(`SELECT COUNT(*) as c FROM _meta`);
    return !row || row.c === 0;
  } catch {
    return true;
  }
}

// ─── Versioned migrations runner (skip-version safe) ─────────────────────
async function runVersionedMigrations(adapter) {
  // Bootstrap _meta first so we can read schemaVersion
  await adapter.exec(buildCreateTableSqlPg("_meta", TABLES._meta));

  const current = parseInt(await getMetaAsync(adapter, "schemaVersion", "0"), 10) || 0;
  const target = latestVersion();
  if (current >= target) return { applied: 0, from: current, to: current };

  const pending = MIGRATIONS.filter((m) => m.version > current);
  let lastApplied = current;
  for (const m of pending) {
    await adapter.transaction(async () => {
      await m.up(adapter);
      await setMetaAsync(adapter, "schemaVersion", m.version);
    });
    lastApplied = m.version;
    console.log(`[DB][migrate] applied #${m.version} ${m.name}`);
  }
  return { applied: pending.length, from: current, to: lastApplied };
}

// ─── Auto-sync (additive only): add missing tables/columns/indexes ───────
async function syncSchemaFromTables(adapter) {
  for (const [tableName, def] of Object.entries(TABLES)) {
    // Create table if absent
    await adapter.exec(buildCreateTableSqlPg(tableName, def));

    // Diff columns via information_schema (PostgreSQL)
    const existing = await adapter.all(
      `SELECT column_name as name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName.toLowerCase()}'`
    );
    const existingNames = new Set(existing.map((r) => r.name));

    for (const [colName, colDef] of Object.entries(def.columns)) {
      // PG column names from information_schema are lowercase
      if (!existingNames.has(colName) && !existingNames.has(colName.toLowerCase())) {
        let safeDef = colDef
          .replace(/PRIMARY KEY( AUTOINCREMENT)?/i, "")
          .replace(/UNIQUE/i, "")
          .trim();
        safeDef = safeDef.replace(/\bREAL\b/gi, "DOUBLE PRECISION");
        try {
          await adapter.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${safeDef}`);
          console.log(`[DB][sync] +column ${tableName}.${colName}`);
        } catch (e) {
          // PG may throw "column already exists" if case-insensitive match
          if (!e.message?.includes("already exists")) {
            console.warn(`[DB][sync] add column ${tableName}.${colName} failed: ${e.message}`);
          }
        }
      }
    }

    // Indexes (idempotent)
    for (const idx of def.indexes || []) {
      try { await adapter.exec(idx); } catch {}
    }
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────
export async function runMigrationOnce(adapter) {
  if (_migratedAdapters.has(adapter)) return;
  _migratedAdapters.add(adapter);

  // Capture freshness BEFORE migrations stamp _meta
  const fresh = await isFreshDb(adapter);

  // Bootstrap _meta so we can read the stored backup schema version below
  await adapter.exec(buildCreateTableSqlPg("_meta", TABLES._meta));

  // 1. Always run versioned migrations chain (skip-version safe)
  await runVersionedMigrations(adapter);

  // 2. Additive sync (auto add missing columns/indexes declared in TABLES)
  await syncSchemaFromTables(adapter);

  // Stamp the schema version we just reached so future boots skip re-backup.
  await setMetaAsync(adapter, "backupSchemaVersion", SCHEMA_VERSION);

  // Track app version for informational purposes only.
  const newVer = getAppVersion();
  const oldVer = await getMetaAsync(adapter, "appVersion", null);
  if (oldVer !== newVer) await setMetaAsync(adapter, "appVersion", newVer);
}
