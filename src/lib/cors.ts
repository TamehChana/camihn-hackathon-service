import { NextRequest } from "next/server";

/** Comma-separated list of allowed origins, or use APP_BASE_URL for a single origin. */
const ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : process.env.APP_BASE_URL
    ? [process.env.APP_BASE_URL.trim(), "https://camihn.org", "https://camihn.vercel.app"]
    : ["https://camihn.org", "https://camihn.vercel.app"];

/**
 * Returns the origin to use for Access-Control-Allow-Origin.
 * If the request's Origin is in the allowlist, it is echoed back; otherwise the first allowed origin is used.
 */
export function getCorsOrigin(req: NextRequest): string {
  const origin = req.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] ?? "https://camihn.org";
}

export type CorsOptions = {
  methods?: string;
  headers?: string;
};

const DEFAULT_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const DEFAULT_HEADERS = "Content-Type, Authorization";

/**
 * Returns CORS headers for the given request so that both camihn.org and camihn.vercel.app (and any ALLOWED_ORIGINS) work.
 */
export function getCorsHeaders(
  req: NextRequest,
  options: CorsOptions = {}
): Record<string, string> {
  const origin = getCorsOrigin(req);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": options.methods ?? DEFAULT_METHODS,
    "Access-Control-Allow-Headers": options.headers ?? DEFAULT_HEADERS,
  };
}
