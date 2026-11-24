import REGISTRY from "../../../open-sse/providers/registry/index.js";

const ANTIGRAVITY_TIER_SUFFIX_RE = /-(xhigh|high|medium|low)$/;

function findStaticRegistryModels(providerId) {
  const entry = REGISTRY.find((r) => r.id === providerId || r.alias === providerId);
  return Array.isArray(entry?.models) ? entry.models : [];
}

/**
 * Normalize a raw live-fetched model entry and enrich it with metadata
 * from the static registry (upstreamModelId, kind, capabilities, etc.)
 * so replacing static defaults with live models preserves routing/thinking behavior.
 */
export function buildSyncedProviderModels(liveModels, providerId) {
  if (!Array.isArray(liveModels) || liveModels.length === 0) return [];

  const staticList = findStaticRegistryModels(providerId);
  const staticById = new Map(staticList.map((m) => [m.id, m]));
  const seen = new Set();
  const result = [];

  for (const rawModel of liveModels) {
    const rawId = rawModel?.id || rawModel?.name || rawModel?.slug;
    if (!rawId || typeof rawId !== "string") continue;

    let cleanId = rawId.trim();
    if (providerId === "gemini") {
      cleanId = cleanId.replace(/^models\//, "");
    } else if (providerId === "qoder") {
      cleanId = cleanId.replace(/^qoder\//, "");
    }

    if (!cleanId || seen.has(cleanId)) continue;
    seen.add(cleanId);

    const staticMeta = staticById.get(cleanId);
    const lowerId = cleanId.toLowerCase();

    let kind = rawModel?.kind || rawModel?.type || staticMeta?.kind || staticMeta?.type || "llm";
    if (kind === "llm") {
      if (lowerId.includes("embed")) {
        kind = "embedding";
      } else if (lowerId.startsWith("tts") || lowerId.includes("speech") || lowerId.includes("-tts")) {
        kind = "tts";
      } else if (lowerId.includes("whisper") || lowerId.includes("transcription")) {
        kind = "stt";
      } else if (
        lowerId.includes("dall-e") ||
        lowerId.includes("imagen") ||
        lowerId.includes("flux") ||
        lowerId.includes("stable-diffusion") ||
        lowerId.includes("-image")
      ) {
        kind = "image";
      }
    }

    const name = rawModel?.displayName || rawModel?.display_name || rawModel?.name || staticMeta?.name || cleanId;

    // Resolve upstreamModelId: prefer static registry mapping (carries thinking suffix like "(high)"),
    // otherwise for Antigravity tiered models auto-derive "(tier)" suffix so thinking levels work.
    let upstreamModelId = staticMeta?.upstreamModelId || rawModel?.upstreamModelId;
    if (providerId === "antigravity" && (!upstreamModelId || upstreamModelId === cleanId)) {
      const tierMatch = cleanId.match(ANTIGRAVITY_TIER_SUFFIX_RE);
      if (tierMatch && kind === "llm") {
        upstreamModelId = `${cleanId}(${tierMatch[1]})`;
      }
    }

    const entry = {
      ...(staticMeta || {}),
      id: cleanId,
      name,
      ...(kind !== "llm" ? { kind } : {}),
      ...(upstreamModelId && upstreamModelId !== cleanId ? { upstreamModelId } : {}),
    };

    if (kind === "llm") {
      delete entry.kind;
      delete entry.type;
    }

    result.push(entry);
  }

  return result;
}
