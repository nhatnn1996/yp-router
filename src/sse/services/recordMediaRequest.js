import { saveRequestDetail, saveRequestUsage } from "@/lib/usageDb";

const ENDPOINT_BY_TYPE = {
  stt: "/v1/audio/transcriptions",
  tts: "/v1/audio/speech",
  image: "/v1/images/generations",
  video: "/v1/videos/generations",
  embedding: "/v1/embeddings",
  search: "/v1/search",
  fetch: "/v1/fetch",
};

/**
 * Record media provider request details and usage stats into the database asynchronously.
 */
export function recordMediaDetail({
  type,
  provider,
  model,
  connectionId,
  apiKey,
  status,
  latencyMs,
  request,
  response,
  providerRequest,
  providerResponse,
}) {
  const reqType = type || "media";
  const reqModel = model || reqType;
  const reqProvider = provider || "unknown";

  try {
    saveRequestDetail({
      type: reqType,
      provider: reqProvider,
      model: reqModel,
      connectionId: connectionId || null,
      apiKey: apiKey || null,
      status: status || "success",
      latency: {
        total: Math.max(0, Math.round(latencyMs || 0)),
      },
      request: request || {},
      response: response || {},
      providerRequest: providerRequest || undefined,
      providerResponse: providerResponse || undefined,
    });
  } catch (err) {
    console.error(`[recordMediaDetail] Failed to log ${reqType} request detail:`, err);
  }

  // Record usage into usageHistory and daily summary so Overview tab tracks it
  try {
    if (reqType !== "embedding") {
      saveRequestUsage({
        provider: reqProvider,
        model: reqModel,
        tokens: { prompt_tokens: 0, completion_tokens: 0 },
        timestamp: new Date().toISOString(),
        connectionId: connectionId || undefined,
        apiKey: apiKey || undefined,
        endpoint: ENDPOINT_BY_TYPE[reqType] || `/${reqType}`,
        status: status === "error" ? "error" : "success",
        type: reqType,
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[recordMediaDetail] Failed to save usage for ${reqType}:`, err);
  }
}

