FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs src/data/dev src/data/prod

# Expose development port
EXPOSE 3050

# Default command is for development
CMD ["yarn", "dev"]
