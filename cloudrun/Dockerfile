FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]