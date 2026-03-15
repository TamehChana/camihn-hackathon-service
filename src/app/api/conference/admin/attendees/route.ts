import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = process.env.CONFERENCE_ADMIN_TOKEN;
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

    const attendees = await prisma.conferenceAttendee.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        // For stats we care about whether there is at least one successful payment.
        // If an attendee has ever paid successfully, they should remain counted as paid.
        payments: {
          where: { status: "SUCCESS" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        volunteer: true,
      },
    });

    const data = attendees.map((a) => {
      const successfulPayment = a.payments[0] ?? null;
      const displayStatus = successfulPayment ? "PAID" : a.status;

      // Do not treat an attendee as being "referred by themselves".
      // Self-referral is approximated as same email or same name on attendee and volunteer.
      const hasVolunteer = !!a.volunteer;
      const isSelfReferral =
        hasVolunteer &&
        ((a.volunteer!.email &&
          a.email &&
          a.volunteer!.email.toLowerCase() === a.email.toLowerCase()) ||
          (a.volunteer!.name &&
            a.fullName &&
            a.volunteer!.name.trim().toLowerCase() === a.fullName.trim().toLowerCase()));

      const volunteer =
        hasVolunteer && !isSelfReferral
          ? { id: a.volunteer!.id, name: a.volunteer!.name, refCode: a.volunteer!.refCode }
          : null;

      return {
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        phone: a.phone,
        organisation: a.organisation,
        role: a.role,
        status: displayStatus,
        volunteerId: volunteer ? a.volunteerId : null,
        volunteer,
        createdAt: a.createdAt,
        payment: successfulPayment ?? null,
      };
    });

    return NextResponse.json(data, { headers: getCorsHeaders(req) });
  } catch (error) {
    console.error("conference admin attendees error", error);
    return NextResponse.json(
      { error: "Unable to fetch attendees" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

/** DELETE: Reset all conference attendees and payments. Admin only. */
export async function DELETE(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    await prisma.conferencePayment.deleteMany({});
    await prisma.conferenceAttendee.deleteMany({});

    return NextResponse.json(
      { ok: true, message: "All conference attendees and payment records have been deleted." },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("conference admin reset attendees error", error);
    return NextResponse.json(
      { error: "Unable to reset attendees" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

