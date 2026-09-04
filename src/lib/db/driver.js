// PostgreSQL-only database driver.
// Requires DATABASE_URL environment variable.

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function initAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[DB] DATABASE_URL is not set. PostgreSQL is required.\n" +
      "Set DATABASE_URL in your .env file, e.g.:\n" +
      "  DATABASE_URL=postgresql://user:pass@host:5432/dbname"
    );
  }

  try {
    const { createPgAdapter } = await import("./adapters/pgAdapter.js");
    const adapter = await createPgAdapter(url);

    if (!state.logged) {
      const safeUrl = url.replace(/\/\/[^@]+@/, "//***@");
      console.log(`[DB] Driver: pg | url: ${safeUrl}`);
      state.logged = true;
    }

    const { runMigrationOnce } = await import("./migrate.js");
    await runMigrationOnce(adapter);
    return adapter;
  } catch (e) {
    if (e.message?.includes("DATABASE_URL")) throw e;
    throw new Error(`[DB] PostgreSQL connection failed: ${e.message}`);
  }
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
