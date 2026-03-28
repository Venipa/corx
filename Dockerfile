FROM oven/bun:1-distroless

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile || bun install
COPY index.ts ./index.ts

CMD ["bun", "--bun", "--smol", "run", "index.ts"]
