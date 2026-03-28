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
const ORIGIN_HOST = process.env.ORIGIN_HOST ?? "*";
const createErrorResponse = (
  request: Request,
  status: number,
  message: string,
): Response => {
  return new Response(message, {
    status,
    headers: createCorsHeaders(request),
  });
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error";
};

const createCorsHeaders = (request: Request): Headers => {
  const requestHeaders: string =
    request.headers.get("access-control-request-headers") ?? "*";
  const requestMethod: string =
    request.headers.get("access-control-request-method") ?? "*";

  const headers: Headers = new Headers();
  headers.set("access-control-allow-origin", ORIGIN_HOST);
  headers.set("access-control-allow-methods", requestMethod);
  headers.set("access-control-allow-headers", requestHeaders);
  headers.set("access-control-expose-headers", "*");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin, access-control-request-method, access-control-request-headers");

  return headers;
};

const parseTarget = (request: Request): ProxyTarget | Response => {
  const sourceUrl: URL = new URL(request.url);
  const rawTarget: string | null = sourceUrl.searchParams.get("url");

  if (!rawTarget) {
    return createErrorResponse(request, 400, "Missing required query param: url");
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return createErrorResponse(request, 400, "Invalid url query param");
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return createErrorResponse(
      request,
      400,
      "Invalid url query param protocol. Only http and https are allowed.",
    );
  }

  sourceUrl.searchParams.forEach((value: string, key: string): void => {
    if (key === "url") {
      return;
    }
    targetUrl.searchParams.append(key, value);
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

const buildCorsResponse = (
  upstreamResponse: Response,
  request: Request,
): Response => {
  const responseHeaders: Headers = new Headers();

  upstreamResponse.headers.forEach((value: string, key: string): void => {
    if (key.toLowerCase().startsWith("access-control-")) {
      return;
    }
    responseHeaders.set(key, value);
  });

  const corsHeaders: Headers = createCorsHeaders(request);
  corsHeaders.forEach((value: string, key: string): void => {
    responseHeaders.set(key, value);
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
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
      return createErrorResponse(
        request,
        502,
        `Upstream request failed: ${getErrorMessage(error)}`,
      );
    }

    return buildCorsResponse(upstreamResponse, request);
  } catch (error: unknown) {
    return createErrorResponse(
      request,
      500,
      `Proxy internal error: ${getErrorMessage(error)}`,
    );
  }
};

const portFromEnv: number =
  Number.parseInt(Bun.env.PORT ?? "", 10) || DEFAULT_PORT;

Bun.serve({
  port: portFromEnv,
  fetch: proxyRequest,
});

console.log(`CORS proxy listening on http://localhost:${portFromEnv}`);