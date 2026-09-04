# Hosted deployment (Railway, Render, Fly.io…): needs a persistent disk mounted at /data
# for the SQLite database and uploaded files. Set env vars: APP_PASSWORD, SESSION_SECRET,
# TEAM_MEMBERS, DATABASE_URL=file:/data/app.db, STORAGE_DIR=/data/storage
FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV DATABASE_URL="file:/data/app.db" STORAGE_DIR="/data/storage" NODE_ENV=production
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
