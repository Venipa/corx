import { createStorage } from "unstorage";
import redisDriver from "unstorage/drivers/redis";
import type { RateLimitStorage } from "./rate-limit-storage";

const RATE_LIMIT_STORAGE_BASE = "rate-limit";

export const createRedisRateLimitStorage = (redisUrl: string): RateLimitStorage => {
	const storage = createStorage({
		driver: redisDriver({
			url: redisUrl,
			base: RATE_LIMIT_STORAGE_BASE,
		}),
	});

	return {
		getItem: (key: string): Promise<string | null> => storage.getItem<string>(key),
		setItem: (key: string, value: string, ttlSeconds: number): Promise<void> =>
			storage.setItem(key, value, { ttl: ttlSeconds }),
	};
};
