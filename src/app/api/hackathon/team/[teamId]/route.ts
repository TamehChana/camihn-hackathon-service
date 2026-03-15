import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "GET, OPTIONS" }) });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;

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


