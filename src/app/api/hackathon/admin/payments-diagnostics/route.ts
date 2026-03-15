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
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "GET, OPTIONS" }) });
}

/**
 * GET /api/hackathon/admin/payments-diagnostics
 * Returns counts and list of hackathon payments by status so you can verify
 * against Fapshi (e.g. "4 teams paid" on Fapshi vs what the DB/webhook has).
 */
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    const [successPayments, allPayments, allPaymentsCount, teamsWithStatusPaid] =
      await Promise.all([
        prisma.payment.findMany({
          where: { status: "SUCCESS" },
          include: {
            team: {
              select: {
                id: true,
                teamName: true,
                leadEmail: true,
                status: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.payment.findMany({
          include: {
            team: {
              select: {
                id: true,
                teamName: true,
                leadEmail: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.count(),
        prisma.team.count({ where: { status: "PAID" } }),
      ]);

    const byStatus = await prisma.payment.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const paidTeamsCount = successPayments.length;
    const uniqueTeamIds = new Set(successPayments.map((p) => p.teamId));
    const uniquePaidTeamsCount = uniqueTeamIds.size;

    const list = successPayments.map((p) => ({
      paymentId: p.id,
      teamId: p.teamId,
      teamName: p.team?.teamName ?? null,
      leadEmail: p.team?.leadEmail ?? null,
      teamStatusInDb: p.team?.status ?? null,
      amount: p.amount,
      currency: p.currency,
      provider: p.provider,
      providerRef: p.providerRef,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    const allPaymentsList = allPayments.map((p) => ({
      paymentId: p.id,
      teamId: p.teamId,
      teamName: p.team?.teamName ?? null,
      leadEmail: p.team?.leadEmail ?? null,
      providerRef: p.providerRef,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return NextResponse.json(
      {
        summary: {
          paymentsWithStatusSuccess: paidTeamsCount,
          uniqueTeamsWithSuccessPayment: uniquePaidTeamsCount,
          teamsWithTeamStatusPaidInDb: teamsWithStatusPaid,
          totalPaymentRecords: allPaymentsCount,
          byStatus: Object.fromEntries(
            byStatus.map((s) => [s.status, s._count.id]),
          ),
        },
        successPaymentsList: list,
        allPaymentsList,
      },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("payments-diagnostics error", error);
    return NextResponse.json(
      { error: "Unable to fetch payment diagnostics" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}
