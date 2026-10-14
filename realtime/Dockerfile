FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4100
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["node", "server.js"]
