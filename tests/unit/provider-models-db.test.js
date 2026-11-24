import { describe, it, expect } from "vitest";
import {
  getProviderModels,
  isValidModel,
  getModelUpstreamId,
  applyProviderModelsOverride,
  resetProviderModelsOverride,
} from "../../open-sse/config/providerModels.js";

describe("Dynamic Provider Models DB & In-Memory Override", () => {
  it("dynamically registers and validates new models via applyProviderModelsOverride", () => {
    const customList = [
      { id: "gemini-test-custom", name: "Gemini Test Custom", upstreamModelId: "gemini-test-upstream" },
    ];

    applyProviderModelsOverride("antigravity", customList);

    expect(isValidModel("antigravity", "gemini-test-custom")).toBe(true);
    expect(isValidModel("ag", "gemini-test-custom")).toBe(true);
    expect(getModelUpstreamId("antigravity", "gemini-test-custom")).toBe("gemini-test-upstream");
    expect(getProviderModels("antigravity")).toHaveLength(1);
  });

  it("can reset back to initial registry defaults", () => {
    resetProviderModelsOverride("antigravity");

    const models = getProviderModels("antigravity");
    expect(models.length).toBeGreaterThan(1);
    expect(isValidModel("antigravity", "gemini-3.8-flash-high")).toBe(true);
  });

  it("can save, get, and delete provider model overrides through providerModelsRepo", async () => {
    const { saveProviderModelsOverride, getProviderModelsOverride, deleteProviderModelsOverride } = await import("../../src/lib/db/repos/providerModelsRepo.js");

    const sample = [
      { id: "test-model-1", name: "Test Model 1", upstreamModelId: "upstream-1" }
    ];

    await saveProviderModelsOverride("test-provider", sample);
    const fetched = await getProviderModelsOverride("test-provider");
    expect(fetched).toHaveLength(1);
    expect(fetched[0].id).toBe("test-model-1");

    await deleteProviderModelsOverride("test-provider");
    const afterDelete = await getProviderModelsOverride("test-provider");
    expect(afterDelete).toBeNull();
  }, 15000);
});

