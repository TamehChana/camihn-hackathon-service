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
  const expected = process.env.CONFERENCE_ADMIN_TOKEN;
  return !!expected && token === expected;
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ attendeeId: string }> },
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const { attendeeId } = await context.params;
    const body = (await req.json()) as {
      fullName?: string;
      email?: string;
      phone?: string;
      organisation?: string;
      role?: string;
      status?: string;
    };

    const data: any = {};
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.organisation !== undefined) data.organisation = body.organisation;
    if (body.role !== undefined) data.role = body.role;
    if (body.status !== undefined) data.status = body.status as any;

    const updated = await prisma.conferenceAttendee.update({
      where: { id: attendeeId },
      data,
    });

    return NextResponse.json(updated, { headers: corsHeaders });
  } catch (error) {
    console.error("conference admin update attendee error", error);
    return NextResponse.json(
      { error: "Unable to update attendee" },
      { status: 500, headers: corsHeaders },
    );
  }
}

