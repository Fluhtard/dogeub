FROM node:18-alpine WORKDIR /app COPY package.json package-lock.json* ./ 
RUN npm install --production 
COPY . . 
RUN if [ -f package.json ] && [ -n "$(cat package.json | grep -E '"build"')" ]; then npm run build; fi 
EXPOSE 8000 CMD ["node", "server.js"]
