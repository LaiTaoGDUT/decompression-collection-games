FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node *.cjs ./
COPY --chown=node:node generated ./generated
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 3000
CMD ["sh", "-c", "node migrate.cjs --apply && exec node index.cjs"]
