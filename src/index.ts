import { proxyRequest } from "./proxy-handler";
import { createRedisRateLimitStorage } from "./rate-limit-storage-redis";

const DEFAULT_PORT: number = 3000;
const portFromEnv: number = Number.parseInt(process?.env?.PORT ?? "", 10) || DEFAULT_PORT;
const parseBooleanEnvironmentValue = (value: string | undefined): boolean => {
	const normalizedValue = value?.trim().toLowerCase();
	if (!normalizedValue) {
		return true;
	}
	return ["1", "true", "yes", "on"].includes(normalizedValue);
};
const isRateLimitEnabled = parseBooleanEnvironmentValue(process?.env?.RATE_LIMIT_ENABLED);
const redisUrl = process?.env?.REDIS_URL;
const rateLimitStorage = isRateLimitEnabled
	? redisUrl
		? createRedisRateLimitStorage(redisUrl)
		: (() => {
				throw new Error("REDIS_URL is required when RATE_LIMIT_ENABLED is true.");
		  })()
	: undefined;

const server = Bun.serve({
	port: portFromEnv,
	fetch(request: Request): Promise<Response> {
		return proxyRequest(request, {
			RATE_LIMIT_ENABLED: process?.env?.RATE_LIMIT_ENABLED,
			RATE_LIMIT_STORAGE: rateLimitStorage,
		});
	},
});

console.log(`CORS proxy listening on http://localhost:${portFromEnv}`);
if (typeof process !== "undefined") {
	async function shutdown(signal: string): Promise<void> {
		console.log(`${signal} received, shutting down...`);
		await server.stop();
		process.exit(0);
	}
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}
