FROM node:lts

WORKDIR /app/

COPY ./ /app/
RUN yarn install
EXPOSE 3000
CMD [ "yarn", "server" ]