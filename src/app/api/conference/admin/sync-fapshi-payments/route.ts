import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const adminToken = process.env.CONFERENCE_ADMIN_TOKEN;
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
 * POST /api/conference/admin/sync-fapshi-payments
 * GET  /api/conference/admin/sync-fapshi-payments
 *
 * Backup job: fetches status from Fapshi for all INITIATED conference payments
 * and updates our DB when Fapshi reports SUCCESSFUL / FAILED / EXPIRED.
 * Use when webhooks were missed (Fapshi sends only one webhook per event).
 *
 * Auth: Bearer with CONFERENCE_ADMIN_TOKEN or CRON_SECRET.
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
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    const apiUser = process.env.FAPSHI_API_USER?.trim();
    const apiKey = process.env.FAPSHI_API_KEY?.trim();
    const baseUrl =
      process.env.FAPSHI_API_BASE_URL?.trim() || "https://sandbox.fapshi.com";

    if (!apiUser || !apiKey) {
      return NextResponse.json(
        { error: "Fapshi API not configured (FAPSHI_API_USER / FAPSHI_API_KEY)" },
        { status: 503, headers: getCorsHeaders(req) },
      );
    }

    const initiated = await prisma.conferencePayment.findMany({
      where: { provider: "FAPSHI", status: "INITIATED" },
      include: {
        attendee: {
          select: { id: true, fullName: true, email: true },
        },
      },
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
          `Conference payment ${payment.id} (${payment.attendee?.fullName ?? payment.attendeeId}): no transId in rawPayload`,
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
            `Conference payment ${payment.id} (${payment.attendee?.fullName ?? payment.attendeeId}): Fapshi returned ${res.status} ${text.slice(0, 100)}`,
          );
          continue;
        }

        const data = (await res.json()) as FapshiTransaction[];
        const tx = Array.isArray(data) ? data[0] : (data as unknown as FapshiTransaction);
        const status = (tx?.status ?? "").toUpperCase();

        if (status === "SUCCESSFUL" || status === "SUCCESS") {
          await prisma.$transaction([
            prisma.conferencePayment.update({
              where: { id: payment.id },
              data: { status: "SUCCESS", rawPayload: (tx ?? payment.rawPayload) as object },
            }),
            prisma.conferenceAttendee.update({
              where: { id: payment.attendeeId },
              data: { status: "PAID" },
            }),
          ]);
          result.updatedToSuccess += 1;
        } else if (status === "FAILED" || status === "EXPIRED") {
          await prisma.conferencePayment.update({
            where: { id: payment.id },
            data: { status: "FAILED", rawPayload: (tx ?? payment.rawPayload) as object },
          });
          result.updatedToFailed += 1;
        }
        // CREATED / PENDING: no change
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(
          `Conference payment ${payment.id} (${payment.attendee?.fullName ?? payment.attendeeId}): ${msg}`,
        );
      }

      // Small delay to avoid hammering Fapshi
      await new Promise((r) => setTimeout(r, 200));
    }

    return NextResponse.json(
      {
        message: "Conference sync complete",
        ...result,
      },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("conference sync-fapshi-payments error", error);
    return NextResponse.json(
      { error: "Conference sync failed", details: String(error) },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "POST, GET, OPTIONS" }) });
}

