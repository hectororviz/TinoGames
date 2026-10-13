FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/level-schema/package.json packages/level-schema/
COPY apps/web/package.json apps/web/
RUN corepack pnpm install --frozen-lockfile --filter @tinogames/web...
COPY . .
ARG VITE_API_URL=https://api.juegos.mposw.com.ar
ENV VITE_API_URL=${VITE_API_URL}
RUN corepack pnpm --filter @tinogames/level-schema build \
 && corepack pnpm --filter @tinogames/web build

FROM nginx:1.27-alpine
RUN apk add --no-cache libcap && setcap cap_net_bind_service=+ep /usr/sbin/nginx
RUN sed -i 's|pid\s\+/run/nginx.pid;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx /var/run /usr/share/nginx/html
EXPOSE 80
USER nginx
CMD ["nginx", "-g", "daemon off;"]
