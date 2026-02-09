# camihn-hackathon-service

This is the **backend service** for CAMIHN Hackathon registrations and payments.

It is a Next.js (App Router) app that exposes APIs for:

- Creating team registrations for the hackathon
- Initiating a 10,000 FCFA team payment with Fapshi
- Handling Fapshi webhooks to mark teams as PAID

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Prisma + PostgreSQL
- Fapshi Payments API

## Getting Started (local)

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
APP_BASE_URL=http://localhost:5173
FAPSHI_API_BASE_URL=https://api.fapshi.com
FAPSHI_SECRET_KEY=sk_test_or_live_here
FAPSHI_WEBHOOK_SECRET=whsec_here
```

3. Run Prisma migrations:

```bash
npx prisma migrate dev --name init
```

4. Start the dev server:

```bash
npm run dev
```

The service will be available at `http://localhost:3000`.

