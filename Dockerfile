FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime keeps tsx + drizzle-kit available for the self-initializing start
# (schema push, pgvector extension, indexes, one-time demo seed).
EXPOSE 3000
CMD ["npm", "run", "start:deploy"]
