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
  context: { params: Promise<{ attendeeId: string }> },
) {
  try {
    const { attendeeId } = await context.params;

    const attendee = await prisma.conferenceAttendee.findUnique({
      where: { id: attendeeId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!attendee) {
      return NextResponse.json(
        { error: "Attendee not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const payment = attendee.payments[0] ?? null;

    return NextResponse.json(
      {
        attendee: {
          id: attendee.id,
          fullName: attendee.fullName,
          email: attendee.email,
          phone: attendee.phone,
          organisation: attendee.organisation,
          role: attendee.role,
          status: attendee.status,
          createdAt: attendee.createdAt,
        },
        payment,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("conference attendee receipt error", error);
    return NextResponse.json(
      { error: "Unable to fetch conference receipt" },
      { status: 500, headers: corsHeaders },
    );
  }
}

