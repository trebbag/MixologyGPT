FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci

COPY . /app
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
