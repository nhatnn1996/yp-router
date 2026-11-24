import { NextResponse } from "next/server";
import { getProviderConnections, saveProviderModelsOverride } from "@/models";
import { buildSyncedProviderModels } from "@/lib/models/normalizeLiveModels";
import { getLiveModelsForConnection } from "../../providers/[id]/models/route.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/models/sync-all
 * Loops over all active provider connections, fetches live models, and replaces
 * each provider's model list in DB & runtime with the fetched live catalog.
 */
export async function POST() {
  try {
    const activeConnections = await getProviderConnections({ isActive: true });
    if (!activeConnections || activeConnections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active connections to sync",
        totalSynced: 0,
        totalAdded: 0,
        results: [],
      });
    }

    // Pick one connection per provider
    const providerMap = new Map();
    for (const conn of activeConnections) {
      if (!providerMap.has(conn.provider)) {
        providerMap.set(conn.provider, conn);
      }
    }

    const results = [];
    let totalSynced = 0;

    for (const [providerId, connection] of providerMap.entries()) {
      try {
        const fetchResult = await getLiveModelsForConnection(connection);
        if (fetchResult.error || !fetchResult.models?.length) {
          results.push({
            provider: providerId,
            status: fetchResult.error ? "skipped" : "empty",
            error: fetchResult.error,
            syncedCount: 0,
            addedCount: 0,
          });
          continue;
        }

        const syncedModels = buildSyncedProviderModels(fetchResult.models, connection.provider);
        if (!syncedModels.length) {
          results.push({
            provider: providerId,
            status: "empty",
            syncedCount: 0,
            addedCount: 0,
          });
          continue;
        }

        await saveProviderModelsOverride(connection.provider, syncedModels);

        totalSynced += syncedModels.length;
        results.push({
          provider: providerId,
          status: "success",
          total: syncedModels.length,
          syncedCount: syncedModels.length,
          addedCount: syncedModels.length,
        });
      } catch (err) {
        results.push({
          provider: providerId,
          status: "error",
          error: err.message,
          syncedCount: 0,
          addedCount: 0,
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalSynced,
      totalAdded: totalSynced,
      results,
    });
  } catch (error) {
    console.error("Error in sync-all models:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync models" },
      { status: 500 }
    );
  }
}
