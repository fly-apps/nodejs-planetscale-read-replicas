FROM node:18-slim

# the image comes with a node user:
USER node

RUN mkdir -p /home/node/app
WORKDIR /home/node/app

COPY --chown=node:node package.json .
COPY --chown=node:node package-lock.json .
RUN npm ci --only=production

COPY --chown=node:node . .

CMD ["node","server.js"]