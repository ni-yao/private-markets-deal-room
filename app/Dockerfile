# syntax=docker/dockerfile:1

# 1) Build the React client
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2) Install production server dependencies
FROM node:20-alpine AS server-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 3) Runtime image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY lib ./lib
COPY data ./data
COPY --from=client /app/client/dist ./client/dist
EXPOSE 8080
USER node
CMD ["node", "server.js"]
