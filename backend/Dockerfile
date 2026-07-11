# ---- Backend Dockerfile (multi-stage) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# (No build step needed — Node ESM server runs directly)

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package*.json ./
COPY --from=build /app/.env.example ./
EXPOSE 5000
CMD ["node", "src/server.js"]
