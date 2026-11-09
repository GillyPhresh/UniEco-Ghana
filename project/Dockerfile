FROM node:20-alpine

WORKDIR /app

# Normalize camera/editor uploads to H.264/AAC MP4 so they play consistently
# in current iOS, Android, and desktop browsers.
RUN apk add --no-cache ffmpeg \
  && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libx264'

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG UNIECO_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV UNIECO_PUBLIC_APP_URL=$UNIECO_PUBLIC_APP_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

# The app and its media converter run unprivileged in production.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "run", "start:railway"]
