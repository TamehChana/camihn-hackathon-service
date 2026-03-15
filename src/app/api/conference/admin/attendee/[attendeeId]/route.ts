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
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "PATCH, OPTIONS" }) });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ attendeeId: string }> },
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
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

    const data: Record<string, unknown> = {};
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.organisation !== undefined) data.organisation = body.organisation;
    if (body.role !== undefined) data.role = body.role;
    if (body.status !== undefined) {
      const s = body.status as string;
      if (s === "PENDING" || s === "PAID" || s === "CANCELLED") data.status = s;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const attendee = await tx.conferenceAttendee.update({
        where: { id: attendeeId },
        data: data as {
          fullName?: string;
          email?: string;
          phone?: string;
          organisation?: string;
          role?: string;
          status?: "PENDING" | "PAID" | "CANCELLED";
        },
        include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (body.status !== undefined && attendee.payments.length > 0) {
        const payment = attendee.payments[0];
        if (body.status === "PAID" && payment.status !== "SUCCESS") {
          await tx.conferencePayment.update({
            where: { id: payment.id },
            data: { status: "SUCCESS" },
          });
        } else if (body.status === "PENDING" && payment.status === "SUCCESS") {
          await tx.conferencePayment.update({
            where: { id: payment.id },
            data: { status: "INITIATED" },
          });
        }
      }
      return tx.conferenceAttendee.findUniqueOrThrow({ where: { id: attendeeId } });
    });

    return NextResponse.json(updated, { headers: getCorsHeaders(req) });
  } catch (error) {
    console.error("conference admin update attendee error", error);
    return NextResponse.json(
      { error: "Unable to update attendee" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

