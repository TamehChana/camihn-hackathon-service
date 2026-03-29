import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

type TeamMemberInput = { name: string; email: string; role?: string };

type RegisterTeamPayload = {
  teamName: string;
  institution?: string;
  volunteerRef?: string;
  lead: {
    name: string;
    email: string;
    phone: string;
    role: string;
  };
  members: TeamMemberInput[];
};

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "POST, OPTIONS" }) });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterTeamPayload;
    const { teamName, institution, volunteerRef, lead, members } = body;

    let volunteerId: string | undefined;
    if (volunteerRef?.trim()) {
      const volunteer = await prisma.volunteer.findUnique({
        where: { refCode: volunteerRef.trim() },
      });
      if (volunteer) {
        volunteerId = volunteer.id;
      }
    }

    if (!teamName || !lead?.name || !lead?.email || !lead?.phone || !lead?.role) {
      return NextResponse.json(
        { error: "Missing required team or lead fields" },
        { status: 400, headers: getCorsHeaders(req) },
      );
    }

    const cleanedMembers = (members || []).filter((m) => m.name && m.email);
    if (cleanedMembers.length === 0) {
      return NextResponse.json(
        { error: "At least one teammate is required" },
        { status: 400, headers: getCorsHeaders(req) },
      );
    }

    const appBase = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
    if (!appBase) {
      console.error("APP_BASE_URL is required for Fapshi redirect and receipt links");
      return NextResponse.json(
        { error: "Payment configuration error" },
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    const receiptToken = randomBytes(32).toString("hex");

    // 1) Create team + members in Postgres
    const team = await prisma.team.create({
      data: {
        teamName,
        institution,
        volunteerId: volunteerId ?? undefined,
        leadName: lead.name,
        leadEmail: lead.email,
        leadPhone: lead.phone,
        leadRole: lead.role,
        receiptToken,
        members: {
          create: cleanedMembers.map((m) => ({
            name: m.name,
            email: m.email,
            role: m.role ?? null,
          })),
        },
      },
    });

    const amount = 10_000;
    const currency = "XAF";

    // 2) Create payment link with Fapshi (Generate Payment Link / initiate-pay)
    const reference = `CAMIHN-${team.id}-${Date.now()}`;

    const rawApiUser = process.env.FAPSHI_API_USER;
    const rawApiKey = process.env.FAPSHI_API_KEY;
    const apiUser = rawApiUser?.trim();
    const apiKey = rawApiKey?.trim();

    if (!apiUser || !apiKey) {
      console.error("Fapshi configuration error: missing FAPSHI_API_USER or FAPSHI_API_KEY");
      return NextResponse.json(
        { error: "Payment configuration error" },
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    console.log(
      "Fapshi apiUser (masked):",
      `${apiUser.substring(0, 6)}...`,
      "len:",
      apiUser.length,
    );

    const successUrl = `${appBase}/hackathon/register/success?teamId=${encodeURIComponent(team.id)}&token=${encodeURIComponent(receiptToken)}`;

    const fapshiResponse = await fetch(
      `${process.env.FAPSHI_API_BASE_URL ?? "https://sandbox.fapshi.com"}/initiate-pay`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
          apiuser: apiUser,
        },
        body: JSON.stringify({
          amount,
          email: lead.email,
          redirectUrl: successUrl,
          userId: team.id,
          externalId: reference,
          message: "CAMIHN Hackathon Team Registration",
        }),
      },
    );

    if (!fapshiResponse.ok) {
      const rawError = await fapshiResponse.text();
      console.error("Fapshi error", rawError);

      let parsed: { message?: string } | null = null;
      try {
        parsed = JSON.parse(rawError);
      } catch {
        // ignore JSON parse error
      }

      return NextResponse.json(
        {
          error: parsed?.message || "Unable to initiate payment with Fapshi",
          providerMessage: rawError,
        },
        { status: 502, headers: getCorsHeaders(req) },
      );
    }

    const fapshiData = (await fapshiResponse.json()) as {
      message?: string;
      link?: string;
      transId?: string;
      dateInitiated?: string;
      [key: string]: unknown;
    };

    if (!fapshiData.link) {
      return NextResponse.json(
        { error: "Fapshi did not return a payment link" },
        { status: 502, headers: getCorsHeaders(req) },
      );
    }

    // Webhook uses "reference" to identify the transaction,
    // so store our own reference/externalId as providerRef.
    const providerRef = reference;

    console.log("Storing payment with providerRef:", providerRef);
    console.log("Fapshi response data:", JSON.stringify(fapshiData, null, 2));

    // 3) Persist payment record
    await prisma.payment.create({
      data: {
        teamId: team.id,
        amount,
        currency,
        provider: "FAPSHI",
        providerRef,
        status: "INITIATED",
        rawPayload: fapshiData as unknown as object,
      },
    });

    console.log("Payment record created for team:", team.id);

    // 4) Respond to frontend with payment link
    return NextResponse.json(
      {
        teamId: team.id,
        payment: {
          amount,
          currency,
          provider: "FAPSHI",
          link: fapshiData.link,
          transId: providerRef,
          message: fapshiData.message ?? "Payment link generated",
        },
      },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("register-team error", error);
    return NextResponse.json(
      { error: "Unable to create registration" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}
