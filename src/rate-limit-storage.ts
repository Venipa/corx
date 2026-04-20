export interface RateLimitStorage {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string, ttlSeconds: number): Promise<void>;
}
