FROM oven/bun:1

WORKDIR /app

COPY package.json ./
COPY index.ts ./
RUN bun install --frozen-lockfile || bun install
RUN bun build index.ts --outfile corx
RUN chmod +x corx

CMD ["./corx"]
