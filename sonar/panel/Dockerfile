FROM node:22-alpine
WORKDIR /app
COPY server.js index.html ./
ENV PORT=3100 HOST=0.0.0.0
EXPOSE 3100
USER node
CMD ["node", "server.js"]
