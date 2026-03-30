import { proxyRequest } from "./proxy-handler";

const DEFAULT_PORT: number = 3000;
const portFromEnv: number = Number.parseInt(process?.env?.PORT ?? "", 10) || DEFAULT_PORT;

const server = Bun.serve({
	port: portFromEnv,
	fetch(request: Request): Promise<Response> {
		return proxyRequest(request);
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
