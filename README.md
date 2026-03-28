# corx

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.


# Usage

```bash
# will proxy the request to https://example.com/api/v1/users
curl -X GET "http://localhost:3000/?url=https://example.com/api/v1/users"


# will proxy the request to https://example.com/api/v1/users?name=John&age=30
curl -X GET "http://localhost:3000/?url=https://example.com/api/v1/users?name=John&age=30"
```

# Options
```
ALLOWED_RESPONSE_CATEGORIES: json,xml,html,yml,text,image,video,audio (default: json,xml,html,yml,text) # sets the allowed response categories
ORIGIN_HOST: * (default) | string (e.g. "https://example.com") # sets the Access-Control-Allow-Origin header value
```
