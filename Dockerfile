# GameCreator MVP - Production Dockerfile
# Node.js + Chrome (for Remotion) + Python (for NanoBanana)

FROM node:20-slim

# Install dependencies for Chrome and Python
RUN apt-get update && apt-get install -y \
    # Chrome dependencies
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    # Git for development
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy game-video package files and install
COPY game-video/package*.json ./game-video/
RUN cd game-video && npm ci --only=production

# Copy application code
COPY . .

# Create directories for data persistence
RUN mkdir -p /app/users /app/data

# Environment variables
ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/google-chrome

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server/index.js"]
