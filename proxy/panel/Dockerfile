FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs config.mjs ./
COPY public ./public
ENV NODE_ENV=production
EXPOSE 2020
CMD ["node", "server.mjs"]
