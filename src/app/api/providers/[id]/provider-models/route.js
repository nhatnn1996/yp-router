import { NextResponse } from "next/server";
import {
  getProviderModelsOverride,
  saveProviderModelsOverride,
  deleteProviderModelsOverride,
} from "@/models";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { resolveProviderId } from "@/shared/constants/providers";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers/[id]/provider-models
 * Get the current models list for a provider (indicates whether it's overridden by DB)
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const providerId = resolveProviderId(id) || id;

    const dbOverride = await getProviderModelsOverride(providerId);
    const activeModels = getModelsByProviderId(providerId);

    return NextResponse.json({
      provider: providerId,
      isOverridden: Boolean(dbOverride),
      total: activeModels.length,
      models: dbOverride || activeModels,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/providers/[id]/provider-models
 * Save or update provider models in DB and immediately update in-memory runtime
 * Body: { models: [ { id, name, upstreamModelId, ... } ] }
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const providerId = resolveProviderId(id) || id;

    const body = await request.json();
    if (!body || !Array.isArray(body.models)) {
      return NextResponse.json(
        { error: "Field 'models' array is required" },
        { status: 400 }
      );
    }

    const result = await saveProviderModelsOverride(providerId, body.models);

    return NextResponse.json({
      success: true,
      provider: providerId,
      count: result.count,
      message: `Updated ${result.count} models in database and runtime for ${providerId}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/providers/[id]/provider-models
 * Remove DB override and reset provider back to default static registry
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const providerId = resolveProviderId(id) || id;

    await deleteProviderModelsOverride(providerId);

    return NextResponse.json({
      success: true,
      provider: providerId,
      message: `Reset ${providerId} models back to static registry defaults`,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
