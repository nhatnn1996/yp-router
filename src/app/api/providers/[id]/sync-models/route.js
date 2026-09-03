import { NextResponse } from "next/server";
import { getProviderConnections, getProviderConnectionById, getCustomModels, addCustomModel, getModelAliases } from "@/models";
import { getProviderAlias, resolveProviderId } from "@/shared/constants/providers";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { getLiveModelsForConnection } from "../models/route.js";

export const dynamic = "force-dynamic";

/**
 * Normalizes model ID and detects its media/service type
 */
function normalizeModel(rawModel, providerId) {
  const rawId = rawModel?.id || rawModel?.name || rawModel?.slug;
  if (!rawId || typeof rawId !== "string") return null;

  let cleanId = rawId.trim();
  if (providerId === "gemini") {
    cleanId = cleanId.replace(/^models\//, "");
  } else if (providerId === "qoder") {
    cleanId = cleanId.replace(/^qoder\//, "");
  }

  const lowerId = cleanId.toLowerCase();
  let type = rawModel?.type || rawModel?.kind || "llm";

  if (type === "llm") {
    if (lowerId.includes("embed")) {
      type = "embedding";
    } else if (lowerId.startsWith("tts") || lowerId.includes("speech")) {
      type = "tts";
    } else if (lowerId.includes("whisper") || lowerId.includes("transcription")) {
      type = "stt";
    } else if (lowerId.includes("dall-e") || lowerId.includes("imagen") || lowerId.includes("flux") || lowerId.includes("stable-diffusion")) {
      type = "image";
    }
  }

  const name = rawModel?.displayName || rawModel?.display_name || rawModel?.name || cleanId;
  return { cleanId, type, name };
}

/**
 * POST /api/providers/[id]/sync-models
 * Fetches live models for a provider's active connection and saves new models into customModels DB
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
      // Find active connection for this provider
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

    // Call live models fetcher
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
        addedCount: 0,
        addedModels: [],
        message: "Provider returned no models",
      });
    }

    const providerStorageAlias = getProviderAlias(connection.provider) || connection.provider;

    // Load existing models (built-in, custom, aliases)
    const [builtInList, customList, aliasesMap] = await Promise.all([
      getModelsByProviderId(connection.provider) || [],
      getCustomModels() || [],
      getModelAliases() || {},
    ]);

    const existingIds = new Set([
      ...builtInList.map((m) => m.id),
      ...customList
        .filter((m) => m.providerAlias === providerStorageAlias)
        .map((m) => m.id),
      ...Object.values(aliasesMap)
        .filter((val) => typeof val === "string" && val.startsWith(`${providerStorageAlias}/`))
        .map((val) => val.slice(providerStorageAlias.length + 1)),
    ]);

    const addedModels = [];

    for (const rawModel of liveModels) {
      const normalized = normalizeModel(rawModel, connection.provider);
      if (!normalized) continue;

      const { cleanId, type, name } = normalized;

      if (existingIds.has(cleanId)) {
        continue;
      }

      // Determine capabilities
      const c = getCapabilitiesForModel(providerStorageAlias, cleanId);
      const caps = {
        vision: Boolean(rawModel.capabilities?.vision ?? rawModel.isVL ?? c.vision),
        reasoning: Boolean(rawModel.capabilities?.reasoning ?? rawModel.isReasoning ?? c.reasoning),
      };

      // Add to database
      await addCustomModel({
        providerAlias: providerStorageAlias,
        id: cleanId,
        type,
        name,
        caps,
      });

      existingIds.add(cleanId);
      addedModels.push({
        providerAlias: providerStorageAlias,
        id: cleanId,
        type,
        name,
        caps,
      });
    }

    return NextResponse.json({
      success: true,
      provider: connection.provider,
      providerAlias: providerStorageAlias,
      total: liveModels.length,
      addedCount: addedModels.length,
      addedModels,
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
