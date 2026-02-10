import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const { teamId } = await context.params;
    const body = (await req.json()) as {
      teamName?: string;
      institution?: string;
      leadName?: string;
      leadEmail?: string;
      leadPhone?: string;
      leadRole?: string;
      status?: string;
    };

    const data: any = {};
    if (body.teamName !== undefined) data.teamName = body.teamName;
    if (body.institution !== undefined) data.institution = body.institution;
    if (body.leadName !== undefined) data.leadName = body.leadName;
    if (body.leadEmail !== undefined) data.leadEmail = body.leadEmail;
    if (body.leadPhone !== undefined) data.leadPhone = body.leadPhone;
    if (body.leadRole !== undefined) data.leadRole = body.leadRole;
    if (body.status !== undefined) data.status = body.status as any;

    const updated = await prisma.team.update({
      where: { id: teamId },
      data,
    });

    return NextResponse.json(updated, { headers: corsHeaders });
  } catch (error) {
    console.error("hackathon admin update team error", error);
    return NextResponse.json(
      { error: "Unable to update team" },
      { status: 500, headers: corsHeaders },
    );
  }
}


