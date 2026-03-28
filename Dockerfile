FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile || bun install

COPY index.ts ./index.ts

CMD ["bun", "run", "index.ts"]
