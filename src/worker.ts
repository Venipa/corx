import type { KVNamespace } from "@cloudflare/workers-types";
import { proxyRequest, type ProxyEnvironment } from "./proxy-handler";
import { createWorkerRateLimitStorage } from "./rate-limit-storage-worker";

type WorkerEnvironment = Omit<ProxyEnvironment, "RATE_LIMIT_STORAGE"> & {
	readonly RATE_LIMIT_KV: KVNamespace;
};

let cachedRateLimitStorage: ProxyEnvironment["RATE_LIMIT_STORAGE"];
let cachedRateLimitKvNamespace: KVNamespace | undefined;

const worker = {
	fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
		if (!cachedRateLimitStorage || cachedRateLimitKvNamespace !== env.RATE_LIMIT_KV) {
			cachedRateLimitStorage = createWorkerRateLimitStorage(env.RATE_LIMIT_KV);
			cachedRateLimitKvNamespace = env.RATE_LIMIT_KV;
		}

		return proxyRequest(request, {
			...env,
			RATE_LIMIT_STORAGE: cachedRateLimitStorage,
		});
	},
};

export default worker;
