import type { KVNamespace } from "@cloudflare/workers-types";
import { createStorage } from "unstorage";
import cloudflareKvBindingDriver from "unstorage/drivers/cloudflare-kv-binding";
import type { RateLimitStorage } from "./rate-limit-storage";

const RATE_LIMIT_STORAGE_BASE = "rate-limit";

export const createWorkerRateLimitStorage = (rateLimitKv: KVNamespace): RateLimitStorage => {
	const storage = createStorage({
		driver: cloudflareKvBindingDriver({
			binding: rateLimitKv,
			base: RATE_LIMIT_STORAGE_BASE,
		}),
	});

	return {
		getItem: (key: string): Promise<string | null> => storage.getItem<string>(key),
		setItem: (key: string, value: string, ttlSeconds: number): Promise<void> =>
			storage.setItem(key, value, { ttl: ttlSeconds }),
	};
};
