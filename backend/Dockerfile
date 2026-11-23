FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000
CMD ["sh", "-c", "node src/db/migrate.js && if [ \"$SEED_DEMO_DATA\" = \"true\" ]; then node src/db/seed.js; fi && exec node src/server.js"]
