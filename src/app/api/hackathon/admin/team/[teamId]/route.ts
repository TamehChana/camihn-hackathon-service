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
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "PATCH, DELETE, OPTIONS" }) });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
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

    const data: Record<string, unknown> = {};
    if (body.teamName !== undefined) data.teamName = body.teamName;
    if (body.institution !== undefined) data.institution = body.institution;
    if (body.leadName !== undefined) data.leadName = body.leadName;
    if (body.leadEmail !== undefined) data.leadEmail = body.leadEmail;
    if (body.leadPhone !== undefined) data.leadPhone = body.leadPhone;
    if (body.leadRole !== undefined) data.leadRole = body.leadRole;
    if (body.status !== undefined) {
      const s = body.status as string;
      if (s === "PENDING" || s === "PAID" || s === "CANCELLED") data.status = s;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const team = await tx.team.update({
        where: { id: teamId },
        data: data as { teamName?: string; institution?: string; leadName?: string; leadEmail?: string; leadPhone?: string; leadRole?: string; status?: "PENDING" | "PAID" | "CANCELLED" },
        include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (body.status !== undefined && team.payments.length > 0) {
        const payment = team.payments[0];
        if (body.status === "PAID" && payment.status !== "SUCCESS") {
          await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS" } });
        } else if (body.status === "PENDING" && payment.status === "SUCCESS") {
          await tx.payment.update({ where: { id: payment.id }, data: { status: "INITIATED" } });
        }
      }
      return tx.team.findUniqueOrThrow({ where: { id: teamId } });
    });

    return NextResponse.json(updated, { headers: getCorsHeaders(req) });
  } catch (error) {
    console.error("hackathon admin update team error", error);
    return NextResponse.json(
      { error: "Unable to update team" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }
    const { teamId } = await context.params;
    await prisma.team.delete({
      where: { id: teamId },
    });
    return NextResponse.json({ deleted: true, teamId }, { headers: getCorsHeaders(req) });
  } catch (error) {
    console.error("hackathon admin delete team error", error);
    return NextResponse.json(
      { error: "Unable to delete team" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}