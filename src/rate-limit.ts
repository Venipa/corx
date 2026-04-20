import type { RateLimitStorage } from "./rate-limit-storage";

const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 30;
const RATE_LIMIT_KEY_PREFIX = "rate-limit";
const UNKNOWN_CLIENT_IDENTIFIER = "unknown-client";

export interface RateLimitState {
	readonly isAllowed: boolean;
	readonly limit: number;
	readonly remaining: number;
	readonly resetSeconds: number;
}

export interface EvaluateRateLimitOptions {
	readonly request: Request;
	readonly storage: RateLimitStorage;
	readonly maxRequests: number;
	readonly windowSeconds: number;
}

export const rateLimitDefaults = {
	maxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
	windowSeconds: DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
} as const;

const parseClientIdentifier = (request: Request): string => {
	const directIpAddress = request.headers.get("cf-connecting-ip")?.trim();
	if (directIpAddress) {
		return directIpAddress;
	}

	const forwardedForHeader = request.headers.get("x-forwarded-for");
	if (!forwardedForHeader) {
		return UNKNOWN_CLIENT_IDENTIFIER;
	}

	const [firstForwardedIpAddress] = forwardedForHeader.split(",");
	const normalizedForwardedIpAddress = firstForwardedIpAddress?.trim();
	return normalizedForwardedIpAddress || UNKNOWN_CLIENT_IDENTIFIER;
};

export const setRateLimitHeaders = (headers: Headers, rateLimitState: RateLimitState): void => {
	headers.set("x-ratelimit-limit", String(rateLimitState.limit));
	headers.set("x-ratelimit-remaining", String(rateLimitState.remaining));
	headers.set("x-ratelimit-reset", String(rateLimitState.resetSeconds));
	if (!rateLimitState.isAllowed) {
		headers.set("retry-after", String(rateLimitState.resetSeconds));
	}
};

export const createRateLimitHeaders = (rateLimitState: RateLimitState): Headers => {
	const headers = new Headers();
	setRateLimitHeaders(headers, rateLimitState);
	return headers;
};

export const evaluateRateLimit = async ({
	request,
	storage,
	maxRequests,
	windowSeconds,
}: EvaluateRateLimitOptions): Promise<RateLimitState> => {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
	const resetSeconds = Math.max(1, windowStart + windowSeconds - nowSeconds);
	const clientIdentifier = parseClientIdentifier(request);
	const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}:${clientIdentifier}:${windowStart}`;
	const currentCountValue = await storage.getItem(rateLimitKey);
	const currentCount = Math.max(0, Number.parseInt(currentCountValue ?? "0", 10) || 0);

	if (currentCount >= maxRequests) {
		return {
			isAllowed: false,
			limit: maxRequests,
			remaining: 0,
			resetSeconds,
		};
	}

	const nextCount = currentCount + 1;
	await storage.setItem(rateLimitKey, String(nextCount), windowSeconds + 5);

	return {
		isAllowed: true,
		limit: maxRequests,
		remaining: Math.max(0, maxRequests - nextCount),
		resetSeconds,
	};
};
