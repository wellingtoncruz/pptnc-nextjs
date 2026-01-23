import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Rate limiting middleware using Upstash Redis
 *
 * Configuration:
 * - UPSTASH_REDIS_REST_URL: Redis endpoint
 * - UPSTASH_REDIS_REST_TOKEN: Redis token
 *
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

export async function middleware(request: NextRequest) {
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

// Apply rate limiting to form submission routes
export const config = {
  matcher: [
    // Form actions
    "/contato/:path*",
    "/sugerir-pauta/:path*",
    // Future API routes
    "/api/:path*",
  ],
};
