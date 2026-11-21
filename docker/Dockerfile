# The board and its watchdog in a container, the same on Linux, macOS, and
# Windows. The workspace is mounted at /app (compose.yaml); node_modules lives
# in a volume and is installed by the entrypoint, so it always matches the
# workspace's package-lock.json and never mixes with the computer's own.
FROM node:22-bookworm-slim

# ffmpeg and ffprobe for the release media; the libraries Remotion's headless
# Chrome needs to compose release images; fonts; tini as init.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg tini \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/coreslopper-entrypoint
RUN chmod 0755 /usr/local/bin/coreslopper-entrypoint

WORKDIR /app
ENV HOME=/tmp/coreslopper-home \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
EXPOSE 4848
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/coreslopper-entrypoint"]
CMD ["npm", "run", "--silent", "cli", "--", "board", "--host", "0.0.0.0", "--port", "4848", "--watch", "5"]
