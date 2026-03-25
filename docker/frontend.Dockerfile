# Stage 1 — Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY ui/package*.json ./
RUN npm ci

# Stage 2 — Build Next.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ui ./

# NEXT_PUBLIC_API_URL is baked into the client bundle at build time.
# Pass the EC2 IP or domain as a build arg: --build-arg NEXT_PUBLIC_API_URL=http://YOUR_IP/api
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# Stage 3 — Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what Next.js needs to run
# public/ is optional — this project doesn't have one
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:3000 || exit 1

CMD ["npm", "start"]
