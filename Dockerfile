FROM node:20-alpine

WORKDIR /app

COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY mcp/index.js ./
COPY mcp/openapi/ ./openapi/

ENV NODE_ENV=production

# Defaults let the server start for tools/list introspection (Glama, MCP Inspector).
# Real usage must override both with the customer's credentials:
#   docker run -e BD_API_KEY=... -e BD_API_URL=https://site.com IMAGE
ENV BD_API_KEY=placeholder
ENV BD_API_URL=https://example.com

ENTRYPOINT ["node", "index.js"]
