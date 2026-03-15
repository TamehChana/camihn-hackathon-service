import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = process.env.HACKATHON_ADMIN_TOKEN;
  return !!expected && token === expected;
}

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "POST, OPTIONS" }) });
}

/**
 * POST /api/hackathon/admin/mark-payment-paid
 * Body: { paymentId?: string, providerRef?: string }
 * Use when Fapshi shows a payment as successful but our webhook didn't update the DB.
 * Marks the hackathon payment as SUCCESS and the team as PAID.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    const body = (await req.json()) as { paymentId?: string; providerRef?: string };
    const { paymentId, providerRef } = body;

    if (!paymentId && !providerRef) {
      return NextResponse.json(
        { error: "Provide paymentId or providerRef (e.g. CAMIHN-xxx-xxx from Fapshi)" },
        { status: 400, headers: getCorsHeaders(req) },
      );
    }

    const payment = paymentId
      ? await prisma.payment.findFirst({
          where: { id: paymentId },
          include: { team: { select: { id: true, teamName: true } } },
        })
      : await prisma.payment.findFirst({
          where: {
            provider: "FAPSHI",
            providerRef: providerRef!,
          },
          include: { team: { select: { id: true, teamName: true } } },
        });

    if (!payment) {
      return NextResponse.json(
        {
          error: paymentId
            ? "Payment not found with that id"
            : "No hackathon payment found with that providerRef. Check providerRef in GET /api/hackathon/admin/payments-diagnostics (allPaymentsList).",
        },
        { status: 404, headers: getCorsHeaders(req) },
      );
    }

    if (payment.status === "SUCCESS") {
      return NextResponse.json(
        {
          message: "Payment was already SUCCESS",
          paymentId: payment.id,
          teamId: payment.teamId,
          teamName: payment.team?.teamName,
        },
        { status: 200, headers: getCorsHeaders(req) },
      );
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCESS" },
      }),
      prisma.team.update({
        where: { id: payment.teamId },
        data: { status: "PAID" },
      }),
    ]);

    return NextResponse.json(
      {
        message: "Payment marked as SUCCESS and team as PAID",
        paymentId: payment.id,
        teamId: payment.teamId,
        teamName: payment.team?.teamName,
        providerRef: payment.providerRef,
      },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("mark-payment-paid error", error);
    return NextResponse.json(
      { error: "Unable to mark payment as paid" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}
