import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { teamId: string } },
) {
  try {
    const { teamId } = params;

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
        { status: 404, headers: corsHeaders },
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
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("receipt team error", error);
    return NextResponse.json(
      { error: "Unable to fetch receipt" },
      { status: 500, headers: corsHeaders },
    );
  }
}


