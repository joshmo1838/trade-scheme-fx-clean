# Isolated, PAPER-ONLY SENFX customer worker image. Never build the Next.js app.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /opt/senfx
COPY worker/package.json ./worker/package.json
RUN cd worker && npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY worker/senfx-customer-paper-worker.mjs ./worker/senfx-customer-paper-worker.mjs
COPY lib/bots/paper-strategy.ts ./lib/bots/paper-strategy.ts
USER node
WORKDIR /opt/senfx/worker
CMD ["node", "--experimental-strip-types", "senfx-customer-paper-worker.mjs"]
