# Premium Download Manager — Official Headless & NAS Container (المرحلة 16.1)
FROM node:20-alpine

LABEL maintainer="Premium DM Community"
LABEL description="Headless Premium Download Manager for NAS & Servers"

# تثبيت متطلبات التشغيل
RUN apk add --no-cache ffmpeg python3 ca-certificates curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# المجلدات المخصصة للبيانات والتنزيلات
VOLUME ["/downloads", "/data"]

ENV PORT=45762
ENV PDM_DOWNLOAD_DIR=/downloads
ENV APPDATA=/data

EXPOSE 45762

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:45762/ping || exit 1

CMD ["node", "src/main/cli.js", "--headless", "--port=45762"]
