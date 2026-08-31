import { NextResponse } from "next/server";
import { getChartData } from "@/lib/usageDb";

function isValidPeriod(period) {
  if (!period || typeof period !== "string") return false;
  if (["today", "24h"].includes(period)) return true;
  const match = period.match(/^(\d+)d$/);
  if (match) {
    const days = parseInt(match[1], 10);
    return days >= 1 && days <= 3650;
  }
  return false;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    const apiKey = searchParams.get("apiKey") || searchParams.get("key");

    if (!isValidPeriod(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const data = await getChartData(period, apiKey);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get chart data:", error);
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
  }
}
