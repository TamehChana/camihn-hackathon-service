import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
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

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const attendees = await prisma.conferenceAttendee.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        volunteer: true,
      },
    });

    const data = attendees.map((a) => {
      const latestPayment = a.payments[0] ?? null;
      const hasSuccessfulPayment = latestPayment?.status === "SUCCESS";
      // Derive status for display: if payment succeeded, attendee is PAID
      const displayStatus = hasSuccessfulPayment ? "PAID" : a.status;
      return {
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        phone: a.phone,
        organisation: a.organisation,
        role: a.role,
        status: displayStatus,
        volunteerId: a.volunteerId,
        volunteer: a.volunteer
          ? { id: a.volunteer.id, name: a.volunteer.name, refCode: a.volunteer.refCode }
          : null,
        createdAt: a.createdAt,
        payment: latestPayment ?? null,
      };
    });

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error("conference admin attendees error", error);
    return NextResponse.json(
      { error: "Unable to fetch attendees" },
      { status: 500, headers: corsHeaders },
    );
  }
}

/** DELETE: Reset all conference attendees and payments. Admin only. */
export async function DELETE(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    await prisma.conferencePayment.deleteMany({});
    await prisma.conferenceAttendee.deleteMany({});

    return NextResponse.json(
      { ok: true, message: "All conference attendees and payment records have been deleted." },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("conference admin reset attendees error", error);
    return NextResponse.json(
      { error: "Unable to reset attendees" },
      { status: 500, headers: corsHeaders },
    );
  }
}

