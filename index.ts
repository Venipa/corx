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
    return new Response("Missing required query param: url", {
      status: 400,
      headers: createCorsHeaders(request),
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return new Response("Invalid url query param", {
      status: 400,
      headers: createCorsHeaders(request),
    });
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

  const upstreamResponse: Response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: canHaveBody ? request.body : undefined,
    redirect: "manual",
  });

  return buildCorsResponse(upstreamResponse, request);
};

const portFromEnv: number =
  Number.parseInt(Bun.env.PORT ?? "", 10) || DEFAULT_PORT;

Bun.serve({
  port: portFromEnv,
  fetch: proxyRequest,
});

console.log(`CORS proxy listening on http://localhost:${portFromEnv}`);