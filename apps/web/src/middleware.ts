import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: HTTPS enforcement + Rate limiting
 *
 * HTTPS: Cloud Run terminates TLS and forwards HTTP to the container.
 * We trust the X-Forwarded-Proto header to determine if the original
 * request was HTTPS, preventing ERR_TOO_MANY_REDIRECTS loops.
 *
 * Rate limiting (Upstash Redis):
 * - UPSTASH_REDIS_REST_URL: Redis endpoint
 * - UPSTASH_REDIS_REST_TOKEN: Redis token
 * If not configured, rate limiting is disabled (allows all requests)
 */

// Lazy initialization to avoid errors when env vars are not set
let ratelimit: ReturnType<typeof createRatelimiter> | null = null;

function createRatelimiter() {
  // Only import and create if env vars are present
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  // Dynamic import to avoid build errors when not configured
  const { Ratelimit } = require("@upstash/ratelimit") as typeof import("@upstash/ratelimit");
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");

  return new Ratelimit({
    redis: Redis.fromEnv(),
    // 10 requests per minute per IP (sliding window)
    limiter: Ratelimit.slidingWindow(10, "1m"),
    analytics: true,
    prefix: "pptnc:ratelimit",
  });
}

function getRatelimiter() {
  if (ratelimit === null) {
    ratelimit = createRatelimiter();
  }
  return ratelimit;
}

// Routes that have rate limiting applied
const RATE_LIMITED_PATHS = ["/contato", "/sugerir-pauta", "/api"];

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  // Trust X-Forwarded-Proto from Cloud Run's reverse proxy.
  // Cloud Run terminates TLS and forwards requests as HTTP with this header.
  // Without this check, any Next.js internal redirect (trailing slash, etc.)
  // uses http:// in Location header, causing infinite redirect loops with
  // the load balancer's HTTP→HTTPS redirect.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (
    process.env.NODE_ENV === "production" &&
    forwardedProto &&
    forwardedProto !== "https"
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Rate limiting only applies to specific paths
  if (!isRateLimitedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const limiter = getRatelimiter();

  // If rate limiting is not configured, allow all requests
  if (!limiter) {
    return NextResponse.next();
  }

  // Get client IP (handles proxies/load balancers)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "127.0.0.1";

  try {
    const { success, limit, remaining, reset } = await limiter.limit(ip);

    // Add rate limit headers to response
    const response = success
      ? NextResponse.next()
      : NextResponse.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Muitas requisições. Por favor, aguarde um momento.",
              retryAfter: Math.ceil((reset - Date.now()) / 1000),
            },
          },
          { status: 429 }
        );

    // Add rate limit headers for debugging
    response.headers.set("X-RateLimit-Limit", limit.toString());
    response.headers.set("X-RateLimit-Remaining", remaining.toString());
    response.headers.set("X-RateLimit-Reset", reset.toString());

    return response;
  } catch (error) {
    // If rate limiting fails, allow the request (fail open)
    // This prevents outages if Redis is temporarily unavailable
    console.error("Rate limiting error:", error);
    return NextResponse.next();
  }
}

// Run middleware on all routes (HTTPS enforcement is global)
// Excludes static assets and Next.js internals for performance
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)",
  ],
};
