import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

function receiptTokensMatch(stored: string, provided: string): boolean {
  try {
    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "GET, OPTIONS" }) });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const urlToken = req.nextUrl.searchParams.get("token")?.trim() ?? "";

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team not found" },
        { status: 404, headers: getCorsHeaders(req) },
      );
    }

    const payment = team.payments[0] ?? null;

    // Server-side paid state: legacy bookmarks (?teamId= only) still work for teams already settled.
    const paidOnServer =
      team.status === "PAID" && payment !== null && payment.status === "SUCCESS";

    // If team has a receipt token, require a matching ?token= unless we already confirmed payment in DB.
    if (team.receiptToken) {
      const tokenOk = urlToken.length > 0 && receiptTokensMatch(team.receiptToken, urlToken);
      if (!tokenOk && !paidOnServer) {
        return NextResponse.json(
          { error: "Invalid or missing receipt token" },
          { status: 401, headers: getCorsHeaders(req) },
        );
      }
    }

    return NextResponse.json(
      {
        team: {
          id: team.id,
          teamName: team.teamName,
          institution: team.institution,
          leadName: team.leadName,
          leadEmail: team.leadEmail,
          leadPhone: team.leadPhone,
          leadRole: team.leadRole,
          status: team.status,
          createdAt: team.createdAt,
        },
        members: team.members,
        payment,
      },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("receipt team error", error);
    return NextResponse.json(
      { error: "Unable to fetch receipt" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}
