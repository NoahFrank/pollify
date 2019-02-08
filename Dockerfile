FROM node:carbon

# Create app directory
WORKDIR /usr/src/app

ADD package.json ./
RUN npm install

# Bundle app source
COPY . .

EXPOSE 3000
CMD [ "npm", "start" ]
