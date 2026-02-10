import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = process.env.HACKATHON_ADMIN_TOKEN;
  return !!expected && token === expected;
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const teams = await prisma.team.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const data = teams.map((t) => ({
      id: t.id,
      teamName: t.teamName,
      institution: t.institution,
      leadName: t.leadName,
      leadEmail: t.leadEmail,
      leadPhone: t.leadPhone,
      leadRole: t.leadRole,
      status: t.status,
      createdAt: t.createdAt,
      members: t.members,
      payment: t.payments[0] ?? null,
    }));

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error("hackathon admin teams error", error);
    return NextResponse.json(
      { error: "Unable to fetch teams" },
      { status: 500, headers: corsHeaders },
    );
  }
}


