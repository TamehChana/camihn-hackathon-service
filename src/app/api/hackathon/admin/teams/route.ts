import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = process.env.HACKATHON_ADMIN_TOKEN;
  return !!expected && token === expected;
}

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "GET, DELETE, OPTIONS" }) });
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    const teams = await prisma.team.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: true,
        volunteer: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const data = teams.map((t: (typeof teams)[number]) => {
      const latestPayment = t.payments[0] ?? null;
      const hasSuccessfulPayment = latestPayment?.status === "SUCCESS";
      // Derive status: if payment succeeded, team is PAID (keeps display correct when Team.status was not yet synced)
      const displayStatus = hasSuccessfulPayment ? "PAID" : t.status;
      return {
        id: t.id,
        teamName: t.teamName,
        institution: t.institution,
        leadName: t.leadName,
        leadEmail: t.leadEmail,
        leadPhone: t.leadPhone,
        leadRole: t.leadRole,
        status: displayStatus,
        volunteerId: t.volunteerId,
        volunteer: t.volunteer
          ? { id: t.volunteer.id, name: t.volunteer.name, refCode: t.volunteer.refCode }
          : null,
        createdAt: t.createdAt,
        members: t.members,
        payment: latestPayment ?? null,
      };
    });

    return NextResponse.json(data, { headers: getCorsHeaders(req) });
  } catch (error) {
    console.error("hackathon admin teams error", error);
    return NextResponse.json(
      { error: "Unable to fetch teams" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

/** DELETE: Reset all – delete all teams (cascades to members and payments). Admin only. */
export async function DELETE(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    await prisma.team.deleteMany({});

    return NextResponse.json(
      { ok: true, message: "All teams and payment records have been deleted." },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("hackathon admin reset all error", error);
    return NextResponse.json(
      { error: "Unable to reset teams" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

