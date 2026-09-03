import { NextResponse } from "next/server";
import { getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getActiveRequests();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get recent requests:", error);
    return NextResponse.json({ error: "Failed to fetch recent requests" }, { status: 500 });
  }
}
