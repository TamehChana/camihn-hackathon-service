import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCorsHeaders } from "@/lib/cors";

type RegisterAttendeePayload = {
  fullName: string;
  email: string;
  phone: string;
  organisation?: string;
  role?: string;
  volunteerRef?: string;
};

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "POST, OPTIONS" }) });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterAttendeePayload;
    const { fullName, email, phone, organisation, role, volunteerRef } = body;

    if (!fullName?.trim() || !email?.trim() || !phone?.trim()) {
      return NextResponse.json(
        { error: "Full name, email, and phone are required" },
        { status: 400, headers: getCorsHeaders(req) },
      );
    }

    let volunteerId: string | undefined;
    if (volunteerRef?.trim()) {
      const volunteer = await prisma.conferenceVolunteer.findUnique({
        where: { refCode: volunteerRef.trim() },
      });
      if (volunteer) {
        volunteerId = volunteer.id;
      }
    }

    const attendee = await prisma.conferenceAttendee.create({
      data: {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        organisation: organisation?.trim() || null,
        role: role?.trim() || null,
        volunteerId: volunteerId ?? undefined,
      },
    });

    const amount = 10_000;
    const currency = "XAF";

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

    const reference = `CAMIHN-CONF-${attendee.id}-${Date.now()}`;

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
          email: attendee.email,
          redirectUrl: `${process.env.APP_BASE_URL}/conference/register/success?attendeeId=${attendee.id}`,
          userId: attendee.id,
          externalId: reference,
          message: "CAMIHN Conference Registration",
        }),
      },
    );

    if (!fapshiResponse.ok) {
      const rawError = await fapshiResponse.text();
      console.error("Fapshi conference error", rawError);

      let parsed: { message?: string } | null = null;
      try {
        parsed = JSON.parse(rawError);
      } catch {
        // ignore JSON parse error
      }

      return NextResponse.json(
        {
          error: parsed?.message || "Unable to initiate conference payment with Fapshi",
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

    const providerRef = reference;

    await prisma.conferencePayment.create({
      data: {
        attendeeId: attendee.id,
        amount,
        currency,
        provider: "FAPSHI",
        providerRef,
        status: "INITIATED",
        rawPayload: fapshiData as unknown as object,
      },
    });

    return NextResponse.json(
      {
        attendeeId: attendee.id,
        payment: {
          amount,
          currency,
          provider: "FAPSHI",
          link: fapshiData.link,
          transId: providerRef,
          message: fapshiData.message ?? "Conference payment link generated",
        },
      },
      { headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("conference register-attendee error", error);
    return NextResponse.json(
      { error: "Unable to create conference registration" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

