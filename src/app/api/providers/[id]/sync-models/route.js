import { NextResponse } from "next/server";
import { getProviderConnections, getProviderConnectionById, saveProviderModelsOverride } from "@/models";
import { getProviderAlias, resolveProviderId } from "@/shared/constants/providers";
import { buildSyncedProviderModels } from "@/lib/models/normalizeLiveModels";
import { getLiveModelsForConnection } from "../models/route.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/providers/[id]/sync-models
 * Fetches live models for a provider's active connection and replaces
 * the provider's model catalog in DB & runtime (hiding hardcoded defaults).
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const providerId = id;

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    let connection = null;
    if (body.connectionId) {
      connection = await getProviderConnectionById(body.connectionId);
    }

    if (!connection) {
      let connections = await getProviderConnections({ provider: providerId, isActive: true });
      if (!connections.length) {
        const resolvedId = resolveProviderId(providerId);
        if (resolvedId && resolvedId !== providerId) {
          connections = await getProviderConnections({ provider: resolvedId, isActive: true });
        }
      }

      if (!connections.length) {
        return NextResponse.json(
          { error: `No active connection found for provider: ${providerId}` },
          { status: 400 }
        );
      }
      connection = connections[0];
    }

    const fetchResult = await getLiveModelsForConnection(connection);
    if (fetchResult.error) {
      return NextResponse.json(
        { error: fetchResult.error },
        { status: fetchResult.status || 500 }
      );
    }

    const liveModels = fetchResult.models || [];
    if (!liveModels.length) {
      return NextResponse.json({
        success: true,
        provider: connection.provider,
        total: 0,
        syncedCount: 0,
        addedCount: 0,
        models: [],
        message: "Provider returned no models",
      });
    }

    const providerStorageAlias = getProviderAlias(connection.provider) || connection.provider;
    const syncedModels = buildSyncedProviderModels(liveModels, connection.provider);

    await saveProviderModelsOverride(connection.provider, syncedModels);

    return NextResponse.json({
      success: true,
      provider: connection.provider,
      providerAlias: providerStorageAlias,
      isOverridden: true,
      total: syncedModels.length,
      syncedCount: syncedModels.length,
      addedCount: syncedModels.length,
      models: syncedModels,
      warning: fetchResult.warning,
    });
  } catch (error) {
    console.error("Error syncing provider models:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync provider models" },
      { status: 500 }
    );
  }
}
