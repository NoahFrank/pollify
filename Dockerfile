FROM node:carbon

# Create app directory
WORKDIR /app

# Install app dependencies
# COPY package.json .
# For npm@5 or later, copy package-lock.json as well
# COPY package.json package-lock.json ./

ADD package.json /app
RUN npm install

# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY /app /app

EXPOSE 3000
CMD [ "npm", "start" ]
