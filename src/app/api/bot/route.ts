import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { BotSection } from "@/components/hedge-fund/types";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";

const STATUS_PATH = process.env.BOT_STATUS_PATH
  ?? path.join(process.cwd(), "trading bot 1.0", "status.json");

export type BotResponse =
  | { live: true;  data: BotSection & { regimes: Record<string, string>; equity: number } }
  | { live: false; error: string };

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;

  try {
    if (!fs.existsSync(STATUS_PATH)) {
      return NextResponse.json(
        { live: false, error: "Bot not running — status.json not found." },
        { status: 503 },
      );
    }

    const raw  = fs.readFileSync(STATUS_PATH, "utf-8");
    const data = JSON.parse(raw) as BotSection & { regimes: Record<string, string>; equity: number };

    return NextResponse.json({ live: true, data });
  } catch (err) {
    return NextResponse.json(
      { live: false, error: String(err) },
      { status: 500 },
    );
  }
}
