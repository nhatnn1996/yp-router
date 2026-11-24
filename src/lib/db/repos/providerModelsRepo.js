import { makeKv } from "../helpers/kvStore.js";
import {
  applyProviderModelsOverride,
  resetProviderModelsOverride,
  loadAllProviderModelOverrides,
} from "open-sse/config/providerModels.js";

const providerModelsKv = makeKv("providerModels");

/**
 * Get model overrides stored in DB for a specific provider
 * @param {string} providerId
 * @returns {Promise<Array|null>}
 */
export async function getProviderModelsOverride(providerId) {
  if (!providerId) return null;
  return await providerModelsKv.get(providerId, null);
}

/**
 * Get all provider model overrides from DB
 * @returns {Promise<Record<string, Array>>}
 */
export async function getAllProviderModelOverrides() {
  return await providerModelsKv.getAll();
}

/**
 * Save provider models override in DB and immediately apply to in-memory runtime
 * @param {string} providerId
 * @param {Array} models
 */
export async function saveProviderModelsOverride(providerId, models) {
  if (!providerId || !Array.isArray(models)) {
    throw new Error("providerId and models array are required");
  }

  await providerModelsKv.set(providerId, models);
  applyProviderModelsOverride(providerId, models);
  return { success: true, count: models.length };
}

/**
 * Delete provider models override from DB and restore in-memory runtime to static defaults
 * @param {string} providerId
 */
export async function deleteProviderModelsOverride(providerId) {
  if (!providerId) return;

  await providerModelsKv.remove(providerId);
  resetProviderModelsOverride(providerId);
  return { success: true };
}

/**
 * Initialize all provider models overrides from DB into in-memory runtime on server startup
 */
export async function initProviderModelsFromDb() {
  try {
    const all = await providerModelsKv.getAll();
    const count = Object.keys(all).length;
    if (count > 0) {
      loadAllProviderModelOverrides(all);
      console.log(`[ProviderModels] Loaded ${count} provider model override(s) from database`);
    }
    return count;
  } catch (err) {
    console.error("[ProviderModels] Failed to load overrides from DB:", err.message);
    return 0;
  }
}
