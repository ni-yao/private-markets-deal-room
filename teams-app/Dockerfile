# syntax=docker/dockerfile:1
# The Deal Room — Teams app (server + built tab).
# Build context = teams-app/ :  docker build -t dealhub-teams ./teams-app
#
# Note: server/sharedLib.js optionally imports ../../app/data for persona mapping.
# That bridge is guarded (degrades to anonymous if app/ isn't in the image), since
# all deal DATA comes from the shared backend over HTTP. To enable persona mapping,
# build from the repo root and COPY app/ alongside.

FROM node:20-alpine AS tab
WORKDIR /tab
COPY tab/package.json ./
RUN npm install
COPY tab/ ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /srv
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY server/ ./server/
COPY --from=tab /tab/dist ./tab/dist
EXPOSE 8090
CMD ["node", "server/index.js"]
