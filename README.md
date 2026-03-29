# corx [![Docker](https://github.com/Venipa/corx/actions/workflows/release.yml/badge.svg)](https://github.com/Venipa/corx/actions/workflows/release.yml)

`corx` is an open-source, self-hostable CORS proxy built with Bun.

It forwards requests to a `url` query param target and returns CORS-enabled responses with response-type controls.

## Why corx

- Open source and easy to self-host
- Small Bun runtime footprint
- Configurable `Access-Control-Allow-Origin`
- Response-category allowlist (`json`, `xml`, `html`, `yml`, `text`, `image`, `video`, `audio`)

## Quick start (Docker)

```bash
docker run --rm -p 3000:3000 ghcr.io/venipa/corx:latest
```

Test it:

```bash
curl "http://localhost:3000/?url=https://example.com"
```

## Docker Compose

```yaml
services:
  corx:
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

## Behavior

- Request method and body are forwarded to upstream
- Hop-by-hop headers are stripped before upstream call
- CORS headers are added on all responses
- Non-binary allowed responses are returned as `text/plain; charset=utf-8`
- Disallowed or unknown upstream content types are blocked with `415`

## Container image

- `ghcr.io/venipa/corx:latest`
- Version tags are published from git tags (for example: `v1.0.0`)
