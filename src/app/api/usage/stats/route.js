import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";

function isValidPeriod(period) {
  if (!period || typeof period !== "string") return false;
  if (["today", "24h", "all"].includes(period)) return true;
  const match = period.match(/^(\d+)d$/);
  if (match) {
    const days = parseInt(match[1], 10);
    return days >= 1 && days <= 3650;
  }
  return false;
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    const apiKey = searchParams.get("apiKey") || searchParams.get("key");

    if (!isValidPeriod(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const stats = await getUsageStats(period, apiKey);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
