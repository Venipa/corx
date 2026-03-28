FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile || bun install
RUN bun build index.ts --outfile corx
RUN chmod +x corx
COPY corx ./corx

CMD ["corx"]
