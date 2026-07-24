FROM node:22-alpine
WORKDIR /app
COPY server.mjs users.json ./
COPY src ./src
COPY database/migrations ./database/migrations
RUN mkdir -p /app/database /app/uploads /app/data/backups
ENV PORT=8787 \
    FLEURSTALES_DB_FILE=/app/database/fleurstales.db \
    FLEURSTALES_USERS_FILE=/app/users.json \
    FLEURSTALES_UPLOAD_DIR=/app/uploads \
    FLEURSTALES_BACKUP_DIR=/app/data/backups
VOLUME ["/app/database", "/app/uploads", "/app/data/backups"]
EXPOSE 8787
CMD ["node", "server.mjs"]
