import { NextResponse } from "next/server";
import { getProviderConnections, getCustomModels, addCustomModel, getModelAliases } from "@/models";
import { getProviderAlias } from "@/shared/constants/providers";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { getLiveModelsForConnection } from "../../providers/[id]/models/route.js";

export const dynamic = "force-dynamic";

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
 * POST /api/models/sync-all
 * Loops over all active provider connections, fetches live models, and saves new ones to DB
 */
export async function POST() {
  try {
    const activeConnections = await getProviderConnections({ isActive: true });
    if (!activeConnections || activeConnections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active connections to sync",
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

    const [customList, aliasesMap] = await Promise.all([
      getCustomModels() || [],
      getModelAliases() || {},
    ]);

    const results = [];
    let totalAdded = 0;

    for (const [providerId, connection] of providerMap.entries()) {
      try {
        const fetchResult = await getLiveModelsForConnection(connection);
        if (fetchResult.error || !fetchResult.models?.length) {
          results.push({
            provider: providerId,
            status: fetchResult.error ? "skipped" : "empty",
            error: fetchResult.error,
            addedCount: 0,
          });
          continue;
        }

        const providerStorageAlias = getProviderAlias(connection.provider) || connection.provider;
        const builtInList = getModelsByProviderId(connection.provider) || [];

        const existingIds = new Set([
          ...builtInList.map((m) => m.id),
          ...customList
            .filter((m) => m.providerAlias === providerStorageAlias)
            .map((m) => m.id),
          ...Object.values(aliasesMap)
            .filter((val) => typeof val === "string" && val.startsWith(`${providerStorageAlias}/`))
            .map((val) => val.slice(providerStorageAlias.length + 1)),
        ]);

        let addedForProvider = 0;
        for (const rawModel of fetchResult.models) {
          const normalized = normalizeModel(rawModel, connection.provider);
          if (!normalized) continue;

          const { cleanId, type, name } = normalized;
          if (existingIds.has(cleanId)) continue;

          const c = getCapabilitiesForModel(providerStorageAlias, cleanId);
          const caps = {
            vision: Boolean(rawModel.capabilities?.vision ?? rawModel.isVL ?? c.vision),
            reasoning: Boolean(rawModel.capabilities?.reasoning ?? rawModel.isReasoning ?? c.reasoning),
          };

          await addCustomModel({
            providerAlias: providerStorageAlias,
            id: cleanId,
            type,
            name,
            caps,
          });

          existingIds.add(cleanId);
          addedForProvider += 1;
        }

        totalAdded += addedForProvider;
        results.push({
          provider: providerId,
          status: "success",
          total: fetchResult.models.length,
          addedCount: addedForProvider,
        });
      } catch (err) {
        results.push({
          provider: providerId,
          status: "error",
          error: err.message,
          addedCount: 0,
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalAdded,
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
