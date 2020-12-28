FROM node:14-alpine as build-image

WORKDIR /opt/pollify

COPY package.json yarn.lock ./

RUN yarn --frozen-lockfile

COPY . .

# RUN yarn lint & yarn test

RUN yarn build

RUN npm prune --production

FROM node:14-alpine

WORKDIR /opt/pollify

COPY --from=build-image /opt/pollify/dist ./dist
COPY --from=build-image /opt/pollify/node_modules ./node_modules
COPY --from=build-image /opt/pollify/views ./views

ARG ENVIRONMENT=production
ARG LOG_LEVEL=INFO
ARG PORT=8080

ENV ENVIRONMENT ${ENVIRONMENT}
ENV NODE_ENV ${ENVIRONMENT}
ENV LOG_LEVEL ${LOG_LEVEL}
ENV PORT ${PORT}

EXPOSE ${PORT}

# start server
CMD [ "node", "dist/server.js" ]