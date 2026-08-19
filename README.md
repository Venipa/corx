# corx [![Docker](https://github.com/Venipa/corx/actions/workflows/release.yml/badge.svg)](https://github.com/Venipa/corx/actions/workflows/release.yml)

`corx` is an open-source, self-hostable CORS proxy built with Bun.

It forwards requests to a `url` query param target and returns CORS-enabled responses with response-type controls.

## Why corx

- Open source and easy to self-host
- Small Bun runtime footprint
- Configurable `Access-Control-Allow-Origin`
- Response-category allowlist (`json`, `xml`, `html`, `yml`, `text`, `image`, `video`, `audio`)
- Optional domain whitelist/blacklist with exact, wildcard, and regex matching

## Quick start (Docker)

GitHub Container Registry:

```bash
docker run --rm -p 3000:3000 ghcr.io/venipa/corx:latest
```

Docker Hub:

```bash
docker run --rm -p 3000:3000 venipa/corx:latest
```

Test it:

```bash
curl "http://localhost:3000/?url=https://example.com"
```

## Docker Compose

```yaml
services:
  corx:
    # image: venipa/corx:latest
    image: ghcr.io/venipa/corx:latest
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      ORIGIN_HOST: "*"
      ALLOWED_RESPONSE_CATEGORIES: "json,xml,html,yml,text"
    restart: unless-stopped
```

## Run from source

```bash
bun install
bun run index.ts
```

## Usage

Proxy a target URL:

```bash
curl "http://localhost:3000/?url=https://example.com/api/v1/users"
```

Include target query params directly in `url`:

```bash
curl "http://localhost:3000/?url=https://example.com/api/v1/users?name=John&age=30"
```

## Environment variables

- `PORT` (default: `3000`)
- `ORIGIN_HOST` (default: `*`)  
  Example: `https://example.com`
- `ALLOWED_RESPONSE_CATEGORIES` (default: `json,xml,html,yml,text`)  
  Allowed values: `json,xml,html,yml,text,image,video,audio`
- `DOMAIN_WHITELIST` (optional)  
  Comma-separated list of allowed domains/rules.  
  Rule formats:
  - Exact: `example.com`
  - Wildcard: `*.example.com`
  - Regex: `/^api\d+\.example\.com$/i`
- `DOMAIN_BLACKLIST` (optional)  
  Comma-separated list of blocked domains/rules (same formats as whitelist).  
  Blacklist is evaluated before whitelist.

## Behavior

- Request method and body are forwarded to upstream
- Hop-by-hop headers are stripped before upstream call
- Upstream redirects are followed server-side, and only the final response is returned (no client redirect)
- CORS headers are added on all responses
- Non-binary allowed responses are returned as `text/plain; charset=utf-8`
- Disallowed or unknown upstream content types are blocked with `415`
- Blocked domains are returned with `403`

## Container image

Same image is published to both registries on git tags (`v*.*.*`):

- GitHub Container Registry: `ghcr.io/venipa/corx`
- Docker Hub: `venipa/corx`

Tags: `latest`, the git tag (for example: `v1.0.0`), and a short git sha. Swap the image name; tags stay the same.
