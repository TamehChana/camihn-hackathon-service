/**
 * Check how many conference attendees have a successful payment in the DB.
 * Run from repo root:
 *   cd camihn-hackathon-service && npm run prisma:generate && node scripts/check-conference-paid.js
 * Requires DATABASE_URL in .env or environment.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const byStatus = await prisma.conferencePayment.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const successPayments = await prisma.conferencePayment.findMany({
    where: { status: "SUCCESS" },
    include: {
      attendee: {
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const allPayments = await prisma.conferencePayment.findMany({
    include: {
      attendee: { select: { fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("\n--- Conference payment counts by status ---");
  byStatus.forEach((s) => console.log(`  ${s.status}: ${s._count.id}`));

  console.log("\n--- All conference payments ---");
  console.log("  Total records:", allPayments.length);
  allPayments.forEach((p, i) => {
    console.log(
      `  ${i + 1}. [${p.status}] ${p.attendee?.fullName ?? p.attendeeId} | ${p.amount} ${p.currency} | providerRef: ${p.providerRef} | id: ${p.id}`
    );
  });

  console.log("\n--- Attendees with at least one SUCCESS payment ---");
  console.log("  Count:", successPayments.length);
  if (successPayments.length > 0) {
    console.log("\n  List:");
    successPayments.forEach((p, i) => {
      console.log(
        `  ${i + 1}. ${p.attendee?.fullName ?? p.attendeeId} | ${p.amount} ${p.currency} | providerRef: ${p.providerRef} | updated: ${p.updatedAt.toISOString()}`
      );
    });
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

