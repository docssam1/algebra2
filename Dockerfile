FROM node:20-slim

WORKDIR /app

COPY package*.json ./
# package-lock.json 이 없으므로 npm ci 대신 npm install 사용
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
ENV PORT=8080

CMD ["node", "server.js"]
