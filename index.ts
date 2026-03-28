import z from "zod";

const DEFAULT_PORT: number = 3000;
const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set<string>([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"content-length",
]);

interface ProxyTarget {
	readonly sourceUrl: URL;
	readonly targetUrl: URL;
}

type ResponseCategory = "json" | "xml" | "html" | "yml" | "text" | "image" | "video" | "audio";
const ResponseCategories: readonly ResponseCategory[] = ["json", "xml", "html", "yml", "text", "image", "video", "audio"] as const;
const DEFAULT_ALLOWED_RESPONSE_CATEGORIES: readonly ResponseCategory[] = [
	"json",
	"xml",
	"html",
	"yml",
	"text",
] as const;
const envSchema = z.object({
	ORIGIN_HOST: z.string().default("*"),
	ALLOWED_RESPONSE_CATEGORIES: z
		.string()
    .default(DEFAULT_ALLOWED_RESPONSE_CATEGORIES.join(","))
		.pipe(
			z.preprocess(
				(v) => {
					if (typeof v === "string") {
						return new Set(v.split(",").map((s) => s.trim().toLowerCase()));
					}
					return v;
				},
				z.set(z.enum(ResponseCategories)),
			),
		)
		.refine((set) => set.size > 0, { message: "ALLOWED_RESPONSE_CATEGORIES must be a non-empty set" }),
});
const { ORIGIN_HOST, ALLOWED_RESPONSE_CATEGORIES } = envSchema.parse(process.env);

const createErrorResponse = (request: Request, status: number, message: string): Response => {
	const headers: Headers = createCorsHeaders(request);
	headers.set("content-type", "text/plain; charset=utf-8");
	headers.set("x-content-type-options", "nosniff");

	return new Response(message, {
		status,
		headers,
	});
};

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "Unknown error";
};

const createCorsHeaders = (request: Request): Headers => {
	const requestHeaders: string = request.headers.get("access-control-request-headers") ?? "*";
	const requestMethod: string = request.headers.get("access-control-request-method") ?? "*";

	const headers: Headers = new Headers();
	headers.set("access-control-allow-origin", ORIGIN_HOST);
	headers.set("access-control-allow-methods", requestMethod);
	headers.set("access-control-allow-headers", requestHeaders);
	headers.set("access-control-expose-headers", "*");
	headers.set("access-control-max-age", "86400");
	headers.set("vary", "origin, access-control-request-method, access-control-request-headers");

	return headers;
};
const schema = z
	.object({
		url: z.url().transform((url: string) => new URL(url)),
	})
	.loose();
type ParsedTarget = z.infer<typeof schema>;
const parseTarget = (request: Request): ProxyTarget | Response => {
	const sourceUrl: URL = new URL(request.url);
	const { url: targetUrl, ...searchParams }: ParsedTarget = schema.parse(
		Object.fromEntries(sourceUrl.searchParams.entries()),
	);
	Object.entries(searchParams).forEach(([key, value]): void => {
		targetUrl.searchParams.append(key, String(value));
	});

	return { sourceUrl, targetUrl };
};

const buildUpstreamHeaders = (request: Request): Headers => {
	const headers: Headers = new Headers();

	request.headers.forEach((value: string, key: string): void => {
		const normalizedKey: string = key.toLowerCase();
		if (HOP_BY_HOP_HEADERS.has(normalizedKey)) {
			return;
		}
		headers.set(key, value);
	});

	return headers;
};

const parseMimeType = (contentTypeHeader: string | null): string => {
	if (!contentTypeHeader) {
		return "";
	}
	const [mimeType = ""] = contentTypeHeader.split(";");
	return mimeType.trim().toLowerCase();
};

const resolveResponseCategory = (mimeType: string): ResponseCategory | null => {
	if (!mimeType) {
		return null;
	}

	if (mimeType.startsWith("video/")) {
		return "video";
	}

	if (mimeType.startsWith("audio/")) {
		return "audio";
	}

	if (mimeType.startsWith("image/")) {
		return "image";
	}

	if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
		return "html";
	}

	if (mimeType === "application/json" || mimeType === "text/json" || mimeType.endsWith("+json")) {
		return "json";
	}

	if (mimeType === "application/xml" || mimeType === "text/xml" || mimeType.endsWith("+xml")) {
		return "xml";
	}

	if (
		mimeType === "text/yaml" ||
		mimeType === "text/x-yaml" ||
		mimeType === "application/yaml" ||
		mimeType === "application/x-yaml"
	) {
		return "yml";
	}

	if (mimeType.startsWith("text/")) {
		return "text";
	}

	return null;
};

const isCategoryAllowed = (category: ResponseCategory): boolean => {
	return ALLOWED_RESPONSE_CATEGORIES.has(category);
};

const copyProxyHeaders = (upstreamResponse: Response, responseHeaders: Headers): void => {
	upstreamResponse.headers.forEach((value: string, key: string): void => {
		const normalizedKey: string = key.toLowerCase();
		if (normalizedKey.startsWith("access-control-")) {
			return;
		}
		responseHeaders.set(key, value);
	});
};

const buildCorsResponse = async (upstreamResponse: Response, request: Request): Promise<Response> => {
	const mimeType: string = parseMimeType(upstreamResponse.headers.get("content-type"));
	const resolvedCategory: ResponseCategory | null = resolveResponseCategory(mimeType);

	if (!resolvedCategory) {
		return createErrorResponse(request, 415, `Blocked upstream content-type: ${mimeType || "unknown"}`);
	}

	if (!isCategoryAllowed(resolvedCategory)) {
		return createErrorResponse(request, 415, `Response type "${resolvedCategory}" is not allowed`);
	}

	const responseHeaders: Headers = new Headers();
	copyProxyHeaders(upstreamResponse, responseHeaders);

	let responseBody: ReadableStream<Uint8Array> | string | null = upstreamResponse.body;
	const isBinaryPassthrough: boolean = ["image", "video", "audio"].includes(resolvedCategory);

	if (!isBinaryPassthrough) {
		responseBody = await upstreamResponse.text();
		responseHeaders.set("content-type", "text/plain; charset=utf-8");
		responseHeaders.delete("content-length");
		responseHeaders.delete("content-encoding");
		responseHeaders.delete("accept-ranges");
		responseHeaders.delete("content-range");
		responseHeaders.set("x-content-type-options", "nosniff");
	}

	const corsHeaders: Headers = createCorsHeaders(request);
	corsHeaders.forEach((value: string, key: string): void => {
		responseHeaders.set(key, value);
	});

	return new Response(responseBody, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: responseHeaders,
	});
};

const formatZodError = (error: z.ZodError): string => {
	return error.issues.map((issue: z.ZodIssue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
};

const proxyRequest = async (request: Request): Promise<Response> => {
	try {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: createCorsHeaders(request),
			});
		}

		const parsedTarget: ProxyTarget | Response = parseTarget(request);
		if (parsedTarget instanceof Response) {
			return parsedTarget;
		}

		const { targetUrl } = parsedTarget;
		const headers: Headers = buildUpstreamHeaders(request);
		const canHaveBody: boolean = !["GET", "HEAD"].includes(request.method);

		let upstreamResponse: Response;
		try {
			upstreamResponse = await fetch(targetUrl, {
				method: request.method,
				headers,
				body: canHaveBody ? request.body : undefined,
				redirect: "manual",
			});
		} catch (error: unknown) {
			return createErrorResponse(request, 502, `Upstream request failed: ${getErrorMessage(error)}`);
		}

		return await buildCorsResponse(upstreamResponse, request);
	} catch (error: unknown) {
		if (error instanceof z.ZodError) {
			return createErrorResponse(request, 400, `Invalid request: \n${formatZodError(error)}`);
		}
		return createErrorResponse(request, 500, `Proxy internal error: ${error}`);
	}
};

const portFromEnv: number = Number.parseInt(Bun.env.PORT ?? "", 10) || DEFAULT_PORT;

Bun.serve({
	port: portFromEnv,
	fetch: proxyRequest,
});

console.log(`CORS proxy listening on http://localhost:${portFromEnv}`);
