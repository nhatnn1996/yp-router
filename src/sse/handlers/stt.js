import {
  extractApiKey, isValidApiKey,
  getProviderCredentials, markAccountUnavailable,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo } from "../services/model.js";
import { handleSttCore } from "open-sse/handlers/sttCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { recordMediaDetail } from "../services/recordMediaRequest.js";
import * as log from "../utils/logger.js";

// Providers requiring credentials for STT
const CREDENTIALED_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => p.serviceKinds?.includes("stt") && !p.noAuth && p.sttConfig?.authType !== "none")
    .map(([id]) => id)
);

function extractSttRequestData(formData, modelStr) {
  const fileObj = formData.get("file");
  const urlVal = formData.get("url");
  const data = {
    model: modelStr,
    fileName: fileObj?.name || (urlVal ? "from_url" : "audio"),
    fileSize: fileObj?.size || 0,
    fileType: fileObj?.type || (urlVal ? "url" : "unknown"),
  };
  for (const [k, v] of formData.entries()) {
    if (k !== "file" && typeof v === "string") {
      if (data[k]) {
        if (Array.isArray(data[k])) data[k].push(v);
        else data[k] = [data[k], v];
      } else {
        data[k] = v;
      }
    }
  }
  return data;
}

export async function handleStt(request) {
  const startTime = Date.now();
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  let formData;
  let audioUrl = null;

  if (contentType.includes("application/json")) {
    try {
      const jsonBody = await request.json();
      formData = new FormData();
      for (const [k, v] of Object.entries(jsonBody)) {
        if (v !== undefined && v !== null) {
          if (Array.isArray(v)) {
            for (const item of v) formData.append(k, item);
          } else {
            formData.append(k, String(v));
          }
        }
      }
      audioUrl = typeof jsonBody.url === "string" ? jsonBody.url : null;
    } catch {
      return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
    }
  } else {
    try {
      formData = await request.formData();
      const urlField = formData.get("url");
      audioUrl = typeof urlField === "string" ? urlField : null;
    } catch {
      return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
    }
  }

  const modelStr = formData.get("model");
  log.request("POST", `/v1/audio/transcriptions | ${modelStr}`);

  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!formData.get("file") && !audioUrl) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: file or url");
  }

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;
  log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);

  // Providers that natively support audio `url` directly in their upstream endpoint
  const NATIVE_URL_PROVIDERS = new Set(["groq"]);

  if (formData.get("file") && formData.get("url")) {
    // If both file and url were sent, remove url to prevent upstream conflict errors (e.g. Groq)
    formData.delete("url");
  } else if (!formData.get("file") && audioUrl) {
    if (NATIVE_URL_PROVIDERS.has(provider)) {
      // Groq handles URL natively without downloading on router server!
      formData.set("url", audioUrl.trim());
    } else {
      // For providers without native URL support, download audio on router
      const trimmedUrl = audioUrl.trim();
      if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
        return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid audio URL: must start with http:// or https://");
      }

      try {
        const audioRes = await fetch(trimmedUrl, {
          signal: AbortSignal.timeout(120000),
        });
        if (!audioRes.ok) {
          return errorResponse(
            HTTP_STATUS.BAD_REQUEST,
            `Failed to fetch audio from URL (${audioRes.status}): ${audioRes.statusText}`
          );
        }
        const blob = await audioRes.blob();

        let fileName = "";
        const cd = audioRes.headers.get("content-disposition") || "";
        const match = cd.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
        if (match && match[1]) {
          fileName = decodeURIComponent(match[1]);
        }
        if (!fileName) {
          try {
            const parsed = new URL(trimmedUrl);
            fileName = parsed.pathname.split("/").filter(Boolean).pop() || "";
          } catch {}
        }

        const mimeType = (blob.type || audioRes.headers.get("content-type") || "audio/mpeg").split(";")[0].trim();
        const mimeExtMap = {
          "audio/mpeg": "mp3",
          "audio/mp3": "mp3",
          "audio/wav": "wav",
          "audio/x-wav": "wav",
          "audio/wave": "wav",
          "audio/mp4": "m4a",
          "audio/x-m4a": "m4a",
          "audio/m4a": "m4a",
          "audio/aac": "aac",
          "audio/ogg": "ogg",
          "audio/webm": "webm",
          "audio/flac": "flac",
          "audio/x-flac": "flac",
        };

        if (!fileName || !fileName.includes(".")) {
          const ext = mimeExtMap[mimeType] || "mp3";
          fileName = fileName ? `${fileName}.${ext}` : `audio.${ext}`;
        }

        const fileObj = new File([blob], fileName, { type: mimeType });
        formData.set("file", fileObj);
        // Important: delete url so we do not send both file and url to upstream
        formData.delete("url");
      } catch (err) {
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `Error downloading audio from URL: ${err.message}`);
      }
    }
  }

  const requestData = extractSttRequestData(formData, modelStr);

  // noAuth providers
  if (!CREDENTIALED_PROVIDERS.has(provider)) {
    const result = await handleSttCore({ provider, model, formData, sttConfig: AI_PROVIDERS[provider]?.sttConfig });
    recordMediaDetail({
      type: "stt",
      provider,
      model,
      apiKey,
      status: result.success ? "success" : "error",
      latencyMs: Date.now() - startTime,
      request: requestData,
      response: result.data || (result.error ? { error: result.error } : {}),
    });
    if (result.success) return result.response;
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "STT failed");
  }

  // Credentialed — fallback loop
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const msg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${msg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const result = await handleSttCore({ provider, model, formData, credentials, sttConfig: AI_PROVIDERS[provider]?.sttConfig });

    recordMediaDetail({
      type: "stt",
      provider,
      model,
      connectionId: credentials?.connectionId,
      apiKey,
      status: result.success ? "success" : "error",
      latencyMs: Date.now() - startTime,
      request: requestData,
      response: result.data || (result.error ? { error: result.error } : {}),
    });

    if (result.success) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }
    return result.response || errorResponse(result.status, result.error);
  }
}
