import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const adminToken = process.env.HACKATHON_ADMIN_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  return (
    (!!adminToken && token === adminToken) ||
    (!!cronSecret && token === cronSecret)
  );
}

type FapshiTransaction = {
  transId?: string;
  status?: string;
  externalId?: string;
  [key: string]: unknown;
};

/**
 * POST /api/hackathon/admin/sync-fapshi-payments
 * GET  /api/hackathon/admin/sync-fapshi-payments
 *
 * Backup job: fetches status from Fapshi for all INITIATED hackathon payments
 * and updates our DB when Fapshi reports SUCCESSFUL / FAILED / EXPIRED.
 * Use when webhooks were missed (Fapshi sends only one webhook per event).
 *
 * Auth: Bearer with HACKATHON_ADMIN_TOKEN or CRON_SECRET.
 *
 * Call periodically (e.g. every 15–30 min) via Vercel Cron or external cron.
 */
export async function POST(req: NextRequest) {
  return runSync(req);
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

async function runSync(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const apiUser = process.env.FAPSHI_API_USER?.trim();
    const apiKey = process.env.FAPSHI_API_KEY?.trim();
    const baseUrl =
      process.env.FAPSHI_API_BASE_URL?.trim() || "https://sandbox.fapshi.com";

    if (!apiUser || !apiKey) {
      return NextResponse.json(
        { error: "Fapshi API not configured (FAPSHI_API_USER / FAPSHI_API_KEY)" },
        { status: 503, headers: corsHeaders },
      );
    }

    const initiated = await prisma.payment.findMany({
      where: { provider: "FAPSHI", status: "INITIATED" },
      include: { team: { select: { id: true, teamName: true } } },
      orderBy: { createdAt: "desc" },
    });

    const result = {
      checked: 0,
      updatedToSuccess: 0,
      updatedToFailed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const payment of initiated) {
      result.checked += 1;
      const raw = payment.rawPayload as { transId?: string } | null;
      const transId = raw?.transId;
      if (!transId) {
        result.skipped += 1;
        result.errors.push(
          `Payment ${payment.id} (${payment.team?.teamName}): no transId in rawPayload`
        );
        continue;
      }

      try {
        const res = await fetch(
          `${baseUrl.replace(/\/$/, "")}/payment-status/${encodeURIComponent(transId)}`,
          {
            method: "GET",
            headers: {
              apiuser: apiUser,
              apikey: apiKey,
            },
          },
        );

        if (!res.ok) {
          const text = await res.text();
          result.errors.push(
            `Payment ${payment.id} (${payment.team?.teamName}): Fapshi returned ${res.status} ${text.slice(0, 100)}`
          );
          continue;
        }

        const data = (await res.json()) as FapshiTransaction[];
        const tx = Array.isArray(data) ? data[0] : (data as unknown as FapshiTransaction);
        const status = (tx?.status ?? "").toUpperCase();

        if (status === "SUCCESSFUL" || status === "SUCCESS") {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data: { status: "SUCCESS", rawPayload: (tx ?? payment.rawPayload) as object },
            }),
            prisma.team.update({
              where: { id: payment.teamId },
              data: { status: "PAID" },
            }),
          ]);
          result.updatedToSuccess += 1;
        } else if (status === "FAILED" || status === "EXPIRED") {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "FAILED", rawPayload: (tx ?? payment.rawPayload) as object },
          });
          result.updatedToFailed += 1;
        }
        // CREATED / PENDING: no change
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(
          `Payment ${payment.id} (${payment.team?.teamName}): ${msg}`
        );
      }

      // Small delay to avoid hammering Fapshi
      await new Promise((r) => setTimeout(r, 200));
    }

    return NextResponse.json(
      {
        message: "Sync complete",
        ...result,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("sync-fapshi-payments error", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}
