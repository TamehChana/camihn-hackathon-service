/**
 * Mark conference payment(s) as SUCCESS and attendee(s) as PAID by providerRef.
 * Use when Fapshi shows payment successful but our webhook didn't update.
 *
 * Usage (from camihn-hackathon-service):
 *   node scripts/mark-conference-payments-paid.js "CAMIHN-CONF-xxx-123"
 * Or with env:
 *   set CONFERENCE_MARK_PAID_REFS=CAMIHN-CONF-xxx-123,CAMIHN-CONF-yyy-456
 *   node scripts/mark-conference-payments-paid.js
 *
 * Requires DATABASE_URL and prisma generate.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const refsFromEnv = process.env.CONFERENCE_MARK_PAID_REFS;
  const refsFromArgs = process.argv.slice(2).filter((a) => a.startsWith("CAMIHN-CONF-"));
  const providerRefs = refsFromArgs.length
    ? refsFromArgs
    : refsFromEnv
      ? refsFromEnv.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (providerRefs.length === 0) {
    console.log(
      "Usage: node scripts/mark-conference-payments-paid.js <providerRef1> [providerRef2 ...]"
    );
    console.log(
      "   Or: set CONFERENCE_MARK_PAID_REFS=ref1,ref2  then node scripts/mark-conference-payments-paid.js"
    );
    console.log(
      "\nGet providerRefs from: npm run check-conference-paid (match with Fapshi dashboard)"
    );
    process.exit(1);
  }

  for (const providerRef of providerRefs) {
    const payment = await prisma.conferencePayment.findFirst({
      where: { provider: "FAPSHI", providerRef },
      include: { attendee: { select: { fullName: true } } },
    });
    if (!payment) {
      console.warn("Not found:", providerRef);
      continue;
    }
    if (payment.status === "SUCCESS") {
      console.log("Already SUCCESS:", payment.attendee?.fullName, "|", providerRef);
      continue;
    }
    await prisma.$transaction([
      prisma.conferencePayment.update({
        where: { id: payment.id },
        data: { status: "SUCCESS" },
      }),
      prisma.conferenceAttendee.update({
        where: { id: payment.attendeeId },
        data: { status: "PAID" },
      }),
    ]);
    console.log("Marked PAID:", payment.attendee?.fullName, "|", providerRef);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

