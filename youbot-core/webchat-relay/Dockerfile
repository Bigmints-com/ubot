FROM node:22-slim
WORKDIR /app
ARG CACHEBUST=20260315
COPY package.json .
COPY server.js .
COPY public/ public/
EXPOSE 8080
CMD ["node", "server.js"]
