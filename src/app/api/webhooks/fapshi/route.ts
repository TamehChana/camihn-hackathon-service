import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Shape this to match Fapshi's webhook payload from:
// https://docs.fapshi.com/en/api-reference/endpoint/webhook
type FapshiWebhookPayload = {
  transId?: string;
  externalId?: string;
  reference?: string;
  status: "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED" | string;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
};

/**
 * Verify webhook signature to ensure the request came from Fapshi.
 * Uses HMAC-SHA256(secret, rawBody). If Fapshi uses a different scheme, adjust here.
 * Constant-time comparison to prevent timing attacks.
 */
function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.replace(/^sha256=/, "").trim();
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-fapshi-signature");
    const rawBody = await req.text();

    console.log("=== FAPSHI WEBHOOK RECEIVED ===");
    console.log("Signature header:", signature ? "present" : "missing");

    const webhookSecret = process.env.FAPSHI_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      if (!signature) {
        console.warn("Webhook secret set but signature missing; rejecting.");
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        console.warn("Webhook signature verification failed; rejecting.");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn("FAPSHI_WEBHOOK_SECRET not set; webhook is not verified. Set it in production.");
    }

    const payload = JSON.parse(rawBody) as FapshiWebhookPayload;

    console.log("Parsed webhook payload:", JSON.stringify(payload, null, 2));

    // externalId is our reference (e.g. CAMIHN-HACK-{teamId}-{ts} or CAMIHN-CONF-{attendeeId}-{ts});
    // transId is Fapshi's transaction id
    const providerRef =
      payload.externalId ?? payload.reference ?? payload.transId ?? "";

    console.log("Looking up payment with providerRef:", providerRef);

    if (!providerRef) {
      console.warn("No providerRef found in webhook payload");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // First, try to find a hackathon payment by providerRef
    let payment = await prisma.payment.findUnique({
      where: {
        provider_providerRef: {
          provider: "FAPSHI",
          providerRef,
        },
      },
    });

    // Flag to indicate whether this webhook is for a conference payment
    let isConference = false;

    // If not found as a hackathon payment, try conference payments
    if (!payment) {
      console.warn(
        "[Fapshi webhook] Hackathon payment not found with providerRef:",
        providerRef,
        "| Payload refs:",
        { externalId: payload.externalId, reference: payload.reference, transId: payload.transId }
      );

      const conferencePayment = await prisma.conferencePayment.findUnique({
        where: {
          provider_providerRef: {
            provider: "FAPSHI",
            providerRef,
          },
        },
        include: {
          attendee: true,
        },
      });

      if (!conferencePayment) {
        console.error(
          "[Fapshi webhook] No matching payment (hackathon or conference). Lookup failed – Fapshi may not have sent externalId, or webhook URL/secret may have prevented earlier delivery. Fields used for lookup:",
          { reference: payload.reference, externalId: payload.externalId, transId: payload.transId, providerRef, status: payload.status }
        );
        return NextResponse.json({ received: true }, { status: 200 });
      }

      isConference = true;

      // Fapshi sends SUCCESSFUL | FAILED | EXPIRED
      const newStatus = (payload.status ?? "").toUpperCase();
      const isSuccess =
        newStatus === "SUCCESS" ||
        newStatus === "SUCCESSFUL" ||
        newStatus.startsWith("SUCCESS");

      const resolvedStatus =
        conferencePayment.status === "SUCCESS"
          ? "SUCCESS"
          : isSuccess
            ? "SUCCESS"
            : "FAILED";

      console.log("Updating conference payment status:", {
        paymentId: conferencePayment.id,
        oldStatus: conferencePayment.status,
        newStatus: resolvedStatus,
        rawStatus: payload.status,
      });

      const updatedConferencePayment = await prisma.conferencePayment.update({
        where: { id: conferencePayment.id },
        data: {
          status: resolvedStatus,
          rawPayload: payload as unknown as object,
        },
      });

      if (updatedConferencePayment.status === "SUCCESS") {
        console.log(
          "Conference payment successful, updating attendee status to PAID for attendee:",
          conferencePayment.attendeeId,
        );
        await prisma.conferenceAttendee.update({
          where: { id: conferencePayment.attendeeId },
          data: { status: "PAID" },
        });
        console.log("Conference attendee status updated successfully");
      }

      console.log("=== CONFERENCE WEBHOOK PROCESSING COMPLETE ===");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Fapshi sends SUCCESSFUL | FAILED | EXPIRED for hackathon payments
    const newStatus = (payload.status ?? "").toUpperCase();
    const isSuccess =
      newStatus === "SUCCESS" ||
      newStatus === "SUCCESSFUL" ||
      newStatus.startsWith("SUCCESS");

    // Idempotency: do not overwrite SUCCESS with FAILED (e.g. out-of-order webhooks)
    const resolvedStatus =
      payment.status === "SUCCESS"
        ? "SUCCESS"
        : isSuccess
          ? "SUCCESS"
          : "FAILED";

    console.log("Updating payment status:", {
      paymentId: payment.id,
      oldStatus: payment.status,
      newStatus: resolvedStatus,
      rawStatus: payload.status,
    });

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: resolvedStatus,
        rawPayload: payload as unknown as object,
      },
    });

    if (updatedPayment.status === "SUCCESS") {
      console.log("Payment successful, updating team status to PAID for team:", payment.teamId);
      await prisma.team.update({
        where: { id: payment.teamId },
        data: { status: "PAID" },
      });
      console.log("Team status updated successfully");
    }

    console.log("=== WEBHOOK PROCESSING COMPLETE ===");
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Fapshi webhook error", error);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}


