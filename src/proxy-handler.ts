import z from "zod";

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

const RESPONSE_CATEGORIES: readonly ResponseCategory[] = [
	"json",
	"xml",
	"html",
	"yml",
	"text",
	"image",
	"video",
	"audio",
] as const;

const DEFAULT_ALLOWED_RESPONSE_CATEGORIES: readonly ResponseCategory[] = [
	"json",
	"xml",
	"html",
	"yml",
	"text",
] as const;

const setParser = <T extends string>(value: string | null | undefined): Set<T> => {
	const parts = value?.split(",") ?? DEFAULT_ALLOWED_RESPONSE_CATEGORIES;
	if (!parts.length) {
		return new Set(DEFAULT_ALLOWED_RESPONSE_CATEGORIES) as Set<T>;
	}
	return new Set(parts.map((part: string) => part.trim().toLowerCase())) as Set<T>;
};

const envSchema = z.object({
	ORIGIN_HOST: z.string().default("*"),
	ALLOWED_RESPONSE_CATEGORIES: z
		.string()
		.nullish()
		.pipe(z.preprocess(setParser, z.set(z.enum(RESPONSE_CATEGORIES))))
		.refine((valueSet) => valueSet.size > 0, { message: "ALLOWED_RESPONSE_CATEGORIES must be a non-empty set" }),
});

const targetSchema = z
	.object({
		url: z.url().transform((value: string) => new URL(value)),
	})
	.loose();

type ParsedTarget = z.infer<typeof targetSchema>;

export interface ProxyEnvironment {
	readonly ORIGIN_HOST?: string;
	readonly ALLOWED_RESPONSE_CATEGORIES?: string;
}

interface ProxyConfig {
	readonly originHost: string;
	readonly allowedResponseCategories: Set<ResponseCategory>;
}

const getRuntimeEnvironment = (): Record<string, string | undefined> => {
	if (typeof process !== "undefined" && process.env) {
		return process.env as Record<string, string | undefined>;
	}
	return {};
};

const resolveConfig = (environment: ProxyEnvironment): ProxyConfig => {
	const runtimeEnvironment = getRuntimeEnvironment();
	const parsedEnvironment = envSchema.parse({
		...runtimeEnvironment,
		...environment,
	});

	return {
		originHost: parsedEnvironment.ORIGIN_HOST,
		allowedResponseCategories: parsedEnvironment.ALLOWED_RESPONSE_CATEGORIES,
	};
};

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "Unknown error";
};

const getRequestOrigin = (request: Request, originHost: string): string => {
	const origin = request.headers.get("origin");

	try {
		if (!origin) {
			return new URL(request.url).origin ?? originHost;
		}
		if (origin.startsWith("http")) {
			return origin;
		}
		return `https://${origin}`;
	} catch {
		return originHost;
	}
};

const createCorsHeaders = (request: Request, originHost: string): Headers => {
	const headers = new Headers();
	const requestOrigin = getRequestOrigin(request, originHost);
	const allowOrigin = originHost === "*" && !requestOrigin ? "*" : (requestOrigin ?? originHost);

	headers.set("access-control-allow-origin", allowOrigin);
	headers.set("access-control-allow-methods", "*");
	headers.set("access-control-allow-headers", "*");
	headers.set("access-control-max-age", "86400");

	return headers;
};

const createErrorResponse = (request: Request, status: number, message: string, originHost: string): Response => {
	const headers = createCorsHeaders(request, originHost);
	headers.set("content-type", "text/plain; charset=utf-8");
	headers.set("x-content-type-options", "nosniff");

	return new Response(message, {
		status,
		headers,
	});
};

const parseTarget = (request: Request): ProxyTarget => {
	const sourceUrl = new URL(request.url);
	const { url: targetUrl, ...searchParams }: ParsedTarget = targetSchema.parse(
		Object.fromEntries(sourceUrl.searchParams.entries()),
	);

	Object.entries(searchParams).forEach(([key, value]): void => {
		targetUrl.searchParams.append(key, String(value));
	});

	return { sourceUrl, targetUrl };
};

const buildUpstreamHeaders = (request: Request): Headers => {
	const headers = new Headers();

	request.headers.forEach((value: string, key: string): void => {
		const normalizedKey = key.toLowerCase();
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

const copyProxyHeaders = (upstreamResponse: Response, responseHeaders: Headers): void => {
	upstreamResponse.headers.forEach((value: string, key: string): void => {
		const normalizedKey = key.toLowerCase();
		if (normalizedKey.startsWith("access-control-")) {
			return;
		}
		responseHeaders.set(key, value);
	});
};

const buildCorsResponse = async (
	upstreamResponse: Response,
	request: Request,
	originHost: string,
	allowedResponseCategories: ReadonlySet<ResponseCategory>,
): Promise<Response> => {
	const mimeType = parseMimeType(upstreamResponse.headers.get("content-type"));
	const responseCategory = resolveResponseCategory(mimeType);

	if (!responseCategory) {
		return createErrorResponse(request, 415, `Blocked upstream content-type: ${mimeType || "unknown"}`, originHost);
	}

	if (!allowedResponseCategories.has(responseCategory)) {
		return createErrorResponse(request, 415, `Response type "${responseCategory}" is not allowed`, originHost);
	}

	const responseHeaders = new Headers();
	copyProxyHeaders(upstreamResponse, responseHeaders);

	let responseBody: ReadableStream<Uint8Array> | string | null = upstreamResponse.body;
	const isBinaryPassthrough = ["image", "video", "audio"].includes(responseCategory);

	if (!isBinaryPassthrough) {
		responseBody = await upstreamResponse.text();
		responseHeaders.set("content-type", "text/plain; charset=utf-8");
		responseHeaders.delete("content-length");
		responseHeaders.delete("content-encoding");
		responseHeaders.delete("accept-ranges");
		responseHeaders.delete("content-range");
		responseHeaders.set("x-content-type-options", "nosniff");
	}

	const corsHeaders = createCorsHeaders(request, originHost);
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

export const proxyRequest = async (request: Request, environment: ProxyEnvironment = {}): Promise<Response> => {
	const { originHost, allowedResponseCategories } = resolveConfig(environment);

	try {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: createCorsHeaders(request, originHost),
			});
		}

		const { targetUrl } = parseTarget(request);
		const headers = buildUpstreamHeaders(request);
		const canHaveBody = !["GET", "HEAD"].includes(request.method);

		let upstreamResponse: Response;
		try {
			upstreamResponse = await fetch(targetUrl, {
				method: request.method,
				headers,
				body: canHaveBody ? request.body : undefined,
				redirect: "manual",
			});
		} catch (error: unknown) {
			return createErrorResponse(request, 502, `Upstream request failed: ${getErrorMessage(error)}`, originHost);
		}

		return await buildCorsResponse(upstreamResponse, request, originHost, allowedResponseCategories);
	} catch (error: unknown) {
		if (error instanceof z.ZodError) {
			return createErrorResponse(request, 400, `Invalid request: \n${formatZodError(error)}`, originHost);
		}
		return createErrorResponse(request, 500, `Proxy internal error: ${error}`, originHost);
	}
};
