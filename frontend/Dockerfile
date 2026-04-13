# ===============================================
# STAGE:1 -- BUILDING THE APP IN BUN ENVIRONMENT
# ================================================
FROM oven/bun:1.3-slim AS builder
WORKDIR /app

COPY ./package.json bun.lock* ./
RUN bun install

COPY . .

# define env args just before build to keep the above cached layers
ARG PORT
ARG VITE_BASE_URL
ARG VITE_API_BASE_URL

RUN bun run build

# =====================================
# STAGE:2 -- CREATING THE NGINX RUNTIME
# ======================================
FROM nginx:alpine AS runtime
WORKDIR /app

#Copy the required configurations and certificates
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx-default.conf /etc/nginx/conf.d/default.conf

#Environment variables
ENV PORT=80

#Expose the ports.
EXPOSE 80
EXPOSE 443

# start nginx server
CMD ["nginx", "-g", "daemon off;"]