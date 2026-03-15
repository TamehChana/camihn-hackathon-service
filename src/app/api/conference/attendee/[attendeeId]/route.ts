import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "GET, OPTIONS" }) });
}

export async function GET(
  req: NextRequest,
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
        { status: 404, headers: getCorsHeaders(req) },
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
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("conference attendee receipt error", error);
    return NextResponse.json(
      { error: "Unable to fetch conference receipt" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

