FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && (npx tsc; test -f dist/server.js)
ENV NODE_ENV=production
EXPOSE 6700
CMD ["npm", "run", "start:prod"]
