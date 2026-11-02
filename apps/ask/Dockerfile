FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
# The audit log lives here; mount a volume so it survives a redeploy.
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV PORT=8787 ASK_LOG_FILE=/app/data/ask-audit.jsonl
EXPOSE 8787
CMD ["node", "src/server.mjs"]
