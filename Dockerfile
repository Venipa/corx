FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile || bun install
RUN bun --bun build index.ts --outfile corx
COPY corx ./corx

CMD ["corx"]
