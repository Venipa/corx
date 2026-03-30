FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY src/ ./src/
RUN bun run build --outfile corx

FROM oven/bun:1-alpine AS runner

WORKDIR /app

COPY --from=builder /app/corx ./corx

CMD ["bun", "--smol", "./corx"]
