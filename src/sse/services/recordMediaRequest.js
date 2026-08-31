import { saveRequestDetail } from "@/lib/usageDb";

/**
 * Record media provider request details into the database asynchronously.
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
  try {
    saveRequestDetail({
      type: type || "media",
      provider: provider || "unknown",
      model: model || "unknown",
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
    console.error(`[recordMediaDetail] Failed to log ${type} request:`, err);
  }
}
