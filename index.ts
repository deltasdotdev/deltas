#!/usr/bin/env node
import figlet from "figlet";
import { input, select, confirm, password } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

// Ensure stdin is in the correct mode
if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
}

// Animated banner
async function showBanner() {
    console.clear();

    const banner = await figlet.text("deltas.dev", {
        font: "Standard",
    });

    console.log(chalk.cyan(banner));
    console.log(chalk.gray("━".repeat(60)));
    console.log(chalk.yellow("  🚀 Environment Setup Wizard"));
    console.log(chalk.gray("━".repeat(60)));
    console.log();
}

async function configureAdmin(existingEnv?: Record<string, string>): Promise<{
    email: string;
    password: string;
    orgName: string;
}> {
    showSection("👤", "Admin User Setup");

    const email = await input({
        message: "Admin email:",
        default: existingEnv?.ADMIN_EMAIL || "admin@deltas.email",
        validate: (value) => {
            if (!value.includes("@")) return "Please enter a valid email";
            return true;
        },
    });

    const adminPassword = await password({
        message: "Admin password:",
        mask: "*",
        validate: (value) => {
            if (!value && !existingEnv?.ADMIN_PASSWORD) {
                return "Password is required";
            }
            if (value && value.length < 8) {
                return "Password must be at least 8 characters";
            }
            return true;
        },
    });

    const finalPassword = adminPassword || existingEnv?.ADMIN_PASSWORD || "StrongPassword123";

    const orgName = await input({
        message: "Organization name:",
        default: existingEnv?.ORG_NAME || "Deltas",
    });

    return {
        email,
        password: finalPassword,
        orgName,
    };
}

// Section header
function showSection(icon: string, title: string) {
    console.log();
    console.log(chalk.cyan(`${icon} ${title}`));
    console.log(chalk.gray("─".repeat(60)));
}

// Generate secure secret
async function generateSecret(): Promise<string> {
    const spinner = ora("Generating secure secret...").start();
    try {
        const { stdout } = await execAsync("openssl rand -base64 32");
        spinner.succeed(chalk.green("Secret generated!"));
        return stdout.trim();
    } catch (error) {
        spinner.fail("Failed to generate secret");
        throw error;
    }
}

// Check if .env files exist
async function checkExistingEnv(): Promise<{
    appExists: boolean;
    deltasExists: boolean;
    shouldReplace: boolean;
    existingAppEnv?: string;
    existingDeltasEnv?: string;
}> {
    const cwd = process.cwd();
    const appEnvPath = path.join(cwd, "app", ".env");
    const deltasEnvPath = path.join(cwd, "deltas", ".env");

    let appExists = false;
    let deltasExists = false;
    let existingAppEnv: string | undefined;
    let existingDeltasEnv: string | undefined;

    try {
        existingAppEnv = await fs.readFile(appEnvPath, "utf-8");
        appExists = true;
    } catch { }

    try {
        existingDeltasEnv = await fs.readFile(deltasEnvPath, "utf-8");
        deltasExists = true;
    } catch { }

    if (appExists || deltasExists) {
        console.log(chalk.yellow("\n⚠️  Existing .env files detected!"));
        if (appExists) console.log(chalk.gray("  → app/.env"));
        if (deltasExists) console.log(chalk.gray("  → deltas/.env"));
        console.log();

        const shouldReplace = await confirm({
            message: "Replace with new configuration?",
            default: false,
        });

        return {
            appExists,
            deltasExists,
            shouldReplace,
            existingAppEnv,
            existingDeltasEnv,
        };
    }

    return { appExists: false, deltasExists: false, shouldReplace: true };
}

// Parse .env
function parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([^=]+)=["']?([^"']*)["']?$/);
        if (match) env[match[1]] = match[2];
    }
    return env;
}

interface ServiceConfig {
    enabled: boolean;
    exposed: boolean;
    config: Record<string, string>;
}

interface EnvConfig {
    services: {
        postgres?: ServiceConfig;
        redis?: ServiceConfig;
        clickhouse?: ServiceConfig;
        minio?: ServiceConfig;
        nginx?: ServiceConfig;
        api?: ServiceConfig;
        app?: ServiceConfig;
    };
    betterAuthSecret: string;
    databaseUrl: string;
    origin: string;
    adminEmail: string;
    adminPassword: string;
    orgName: string;
    smtpHost: string;
    smtpPort: string;
    smtpFrom: string;
    smtpUser: string;
    smtpPassword: string;
}


// Configure SMTP
async function configureSMTP(existingEnv?: Record<string, string>): Promise<{
    host: string;
    port: string;
    from: string;
    user: string;
    password: string;
}> {
    showSection("📧", "SMTP Configuration");

    const configure = await confirm({
        message: "Configure SMTP settings?",
        default: false,
    });

    if (!configure) {
        return {
            host: existingEnv?.SMTP_HOST || "",
            port: existingEnv?.SMTP_PORT || "",
            from: existingEnv?.SMTP_FROM || "",
            user: existingEnv?.SMTP_USER || "",
            password: existingEnv?.SMTP_PASSWORD || "",
        };
    }

    const host = await input({
        message: "SMTP host:",
        default: existingEnv?.SMTP_HOST || "localhost",
    });

    const port = await input({
        message: "SMTP port:",
        default: existingEnv?.SMTP_PORT || "1025",
    });

    const from = await input({
        message: "From email address:",
        default: existingEnv?.SMTP_FROM || "noreply@localhost",
    });

    const user = await input({
        message: "SMTP username (leave empty if not required):",
        default: existingEnv?.SMTP_USER || "",
    });

    const pass = await password({
        message: "SMTP password (leave empty if not required):",
        mask: "*",
    });

    return {
        host,
        port,
        from,
        user,
        password: pass || existingEnv?.SMTP_PASSWORD || "",
    };
}

// Configure Deltas API
async function configureDeltasAPI(existingEnv?: Record<string, string>): Promise<ServiceConfig | null> {
    showSection("🚀", "Deltas API Configuration");

    const enabled = await confirm({
        message: "Deploy Deltas Ingestion server?",
        default: true,
    });

    if (!enabled) return null;

    const port = await input({
        message: "API port:",
        default: existingEnv?.API_PORT || "3000",
    });

    return {
        enabled: true,
        exposed: true,
        config: {
            API_PORT: port,
        },
    };
}

// Configure Deltas App
async function configureDeltasApp(existingEnv?: Record<string, string>): Promise<ServiceConfig | null> {
    showSection("💻", "Deltas App Configuration");

    const enabled = await confirm({
        message: "Deploy Deltas App ?",
        default: true,
    });

    if (!enabled) return null;


    const port = await input({
        message: "App port:",
        default: existingEnv?.APP_PORT || "5173",
    });

    return {
        enabled: true,
        exposed: true,
        config: {
            APP_PORT: port,
        },
    };
}

// Configure Nginx
async function configureNginx(hasApi: boolean, hasApp: boolean): Promise<ServiceConfig | null> {
    if (!hasApi && !hasApp) return null;

    showSection("🌐", "Nginx Configuration");

    const enabled = await confirm({
        message: "Deploy Nginx reverse proxy?",
        default: hasApi || hasApp,
    });

    if (!enabled) return null;

    const domain = await input({
        message: "Domain name (or leave empty for localhost):",
        default: "",
    });

    const sslEnabled = domain ? await confirm({
        message: "Enable SSL/TLS (HTTPS)?",
        default: true,
    }) : false;

    return {
        enabled: true,
        exposed: true,
        config: {
            DOMAIN: domain || "localhost",
            SSL_ENABLED: sslEnabled ? "true" : "false",
        },
    };
}

// Configure PostgreSQL
async function configurePostgres(existingEnv?: Record<string, string>): Promise<ServiceConfig | null> {
    showSection("📦", "PostgreSQL Configuration");

    const deploymentType = await select({
        message: "PostgreSQL deployment:",
        choices: [
            { name: "Local (Docker)", value: "local" },
            { name: "Hosted (External)", value: "hosted" },
            { name: "Skip", value: "skip" },
        ],
    });

    if (deploymentType === "skip") return null;

    if (deploymentType === "local") {
        const user = await input({
            message: "Username:",
            default: existingEnv?.POSTGRES_USER || "root",
        });

        const pass = await password({ message: "Password:", mask: "*" });
        const finalPass = pass || existingEnv?.POSTGRES_PASSWORD || "mysecretpassword";

        const db = await input({
            message: "Database name:",
            default: existingEnv?.POSTGRES_DB || "deltas",
        });

        const exposed = await confirm({
            message: "Expose to internet?",
            default: false,
        });

        return {
            enabled: true,
            exposed,
            config: { POSTGRES_USER: user, POSTGRES_PASSWORD: finalPass, POSTGRES_DB: db },
        };
    } else {
        const url = await input({
            message: "Connection URL:",
            default: existingEnv?.DATABASE_URL || "postgres://user:pass@host:5432/db",
        });
        return {
            enabled: false,
            exposed: false,
            config: { DATABASE_URL: url },
        };
    }
}

// Configure Redis
async function configureRedis(existingEnv?: Record<string, string>): Promise<ServiceConfig | null> {
    showSection("🔴", "Redis Configuration");

    const deploymentType = await select({
        message: "Redis deployment:",
        choices: [
            { name: "Local (Docker)", value: "local" },
            { name: "Hosted (External)", value: "hosted" },
            { name: "Skip", value: "skip" },
        ],
    });

    if (deploymentType === "skip") return null;

    if (deploymentType === "local") {
        const exposed = await confirm({
            message: "Expose to internet?",
            default: false,
        });
        return { enabled: true, exposed, config: {} };
    } else {
        const url = await input({
            message: "Connection URL:",
            default: existingEnv?.REDIS_URL || "redis://localhost:6379",
        });
        return { enabled: false, exposed: false, config: { REDIS_URL: url } };
    }
}

// Configure ClickHouse
async function configureClickHouse(existingEnv?: Record<string, string>): Promise<ServiceConfig | null> {
    showSection("📊", "ClickHouse Configuration");

    const deploymentType = await select({
        message: "ClickHouse deployment:",
        choices: [
            { name: "Local (Docker)", value: "local" },
            { name: "Hosted (External)", value: "hosted" },
            { name: "Skip", value: "skip" },
        ],
    });

    if (deploymentType === "skip") return null;

    if (deploymentType === "local") {
        const pass = await password({ message: "Password:", mask: "*" });
        const finalPass = pass || existingEnv?.CLICKHOUSE_PASSWORD || "clickhouse";

        const exposed = await confirm({
            message: "Expose to internet?",
            default: false,
        });

        return {
            enabled: true,
            exposed,
            config: { CLICKHOUSE_PASSWORD: finalPass },
        };
    } else {
        const host = await input({
            message: "Host:",
            default: existingEnv?.CLICKHOUSE_HOST || "localhost",
        });
        const port = await input({
            message: "HTTP port:",
            default: existingEnv?.CLICKHOUSE_PORT || "8123",
        });
        const nativePort = await input({
            message: "Native port:",
            default: existingEnv?.CLICKHOUSE_NATIVE_PORT || "19000",
        });
        const user = await input({
            message: "User:",
            default: existingEnv?.CLICKHOUSE_USER || "default",
        });
        const pass = await password({ message: "Password:", mask: "*" });
        const finalPass = pass || existingEnv?.CLICKHOUSE_PASSWORD || "";
        const db = await input({
            message: "Database:",
            default: existingEnv?.CLICKHOUSE_DATABASE || "default",
        });

        return {
            enabled: false,
            exposed: false,
            config: {
                CLICKHOUSE_HOST: host,
                CLICKHOUSE_PORT: port,
                CLICKHOUSE_NATIVE_PORT: nativePort,
                CLICKHOUSE_USER: user,
                CLICKHOUSE_PASSWORD: finalPass,
                CLICKHOUSE_DATABASE: db,
            },
        };
    }
}

// Configure MinIO
async function configureMinIO(existingEnv?: Record<string, string>): Promise<ServiceConfig | null> {
    showSection("🗄️", "MinIO (S3) Configuration");

    const deploymentType = await select({
        message: "MinIO/S3 deployment:",
        choices: [
            { name: "Local (Docker MinIO)", value: "local" },
            { name: "Hosted (S3/R2/etc)", value: "hosted" },
            { name: "Skip", value: "skip" },
        ],
    });

    if (deploymentType === "skip") return null;

    if (deploymentType === "local") {
        const accessKey = await input({
            message: "Access key:",
            default: existingEnv?.S3_ACCESS_KEY || "minioadmin",
        });
        const secretKey = await password({ message: "Secret key:", mask: "*" });
        const finalSecret = secretKey || existingEnv?.S3_SECRET_KEY || "minioadmin";
        const bucket = await input({
            message: "Bucket name:",
            default: existingEnv?.S3_BUCKET || "deltas-bucket",
        });
        const exposed = await confirm({
            message: "Expose to internet?",
            default: false,
        });

        return {
            enabled: true,
            exposed,
            config: {
                S3_ACCESS_KEY: accessKey,
                S3_SECRET_KEY: finalSecret,
                S3_BUCKET: bucket,
            },
        };
    } else {
        const endpoint = await input({
            message: "S3 endpoint:",
            default: existingEnv?.S3_ENDPOINT || "https://s3.amazonaws.com",
        });
        const accessKey = await input({
            message: "Access key:",
            default: existingEnv?.S3_ACCESS_KEY || "",
        });
        const secretKey = await password({ message: "Secret key:", mask: "*" });
        const finalSecret = secretKey || existingEnv?.S3_SECRET_KEY || "";
        const bucket = await input({
            message: "Bucket name:",
            default: existingEnv?.S3_BUCKET || "",
        });

        return {
            enabled: false,
            exposed: false,
            config: {
                S3_ENDPOINT: endpoint,
                S3_ACCESS_KEY: accessKey,
                S3_SECRET_KEY: finalSecret,
                S3_BUCKET: bucket,
            },
        };
    }
}

// Generate nginx.conf
function generateNginxConf(config: EnvConfig): string {
    const domain = config.services.nginx?.config.DOMAIN || "localhost";
    const sslEnabled = config.services.nginx?.config.SSL_ENABLED === "true";
    const hasApi = config.services.api?.enabled;
    const hasApp = config.services.app?.enabled;

    const apiUpstream = hasApi ? `upstream api {
    server api:3000;
    keepalive 64;
}

` : '';

    const appUpstream = hasApp ? `upstream app {
    server app:5173;
    keepalive 32;
}

` : '';

    const sslConfig = sslEnabled ? `
    # SSL Configuration
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
` : '    listen 80;\n    listen [::]:80;';

    const httpRedirect = sslEnabled ? `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}

` : '';

    const apiLocation = hasApi ? `
    # API routes - /post/* and /get/* only
    location ~ ^/(post|get)/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        
        # Performance optimizations for high-throughput ingestion
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_set_header Connection "";
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts optimized for fast ingestion
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
        
        # No retries for POST requests (idempotency)
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 1;
    }
` : '';

    const appLocation = hasApp ? `
    # App routes - everything else
    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Standard timeouts for app
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
` : '';

    return `# Nginx configuration for Deltas - High Performance Event Ingestion
# Generated by Deltas Setup Wizard

user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main buffer=32k flush=5s;

    # Performance optimizations
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript 
               application/json application/javascript application/xml+rss 
               application/rss+xml font/truetype font/opentype 
               application/vnd.ms-fontobject image/svg+xml;

    # Client body optimization for high-throughput ingestion
    client_body_buffer_size 128k;
    client_max_body_size 10m;
    client_body_timeout 10s;
    client_header_timeout 10s;
    send_timeout 10s;

    # Upstream definitions
    ${apiUpstream}${appUpstream}
    ${httpRedirect}server {
${sslConfig}
        server_name ${domain};

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
${apiLocation}${appLocation}
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\\n";
            add_header Content-Type text/plain;
        }
    }
}`;
}

// Generate Docker Compose
function generateDockerCompose(config: EnvConfig): string {
    const services: string[] = [];

    const nginxDeps = [
        config.services.api?.enabled && 'api',
        config.services.app?.enabled && 'app'
    ].filter(Boolean);
    
    const nginxDependsOn = nginxDeps.length > 0 
        ? `    depends_on:\n${nginxDeps.map(dep => `      - ${dep}`).join('\n')}`
        : '';

    // Nginx
    if (config.services.nginx?.enabled) {
        const ports = '      - "80:80"\n      - "443:443"';
        services.push(`  # Nginx - Reverse Proxy & Load Balancer
  nginx:
    image: nginx:alpine
    container_name: deltas-nginx
    restart: unless-stopped
    ports:
${ports}
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - nginx_logs:/var/log/nginx
    networks:
      - deltas-network
${nginxDependsOn ? '\n' + nginxDependsOn : ''}`);
    }

    // Deltas API
    if (config.services.api?.enabled) {
        const apiPort = config.services.api.config.API_PORT || "3000";
        const ports = config.services.api.exposed
            ? `      - "${apiPort}:3000"`
            : `      - "127.0.0.1:${apiPort}:3000"`;

        services.push(`
  # Deltas API - High Performance Event Ingestion
  api:
    build:
      context: ./deltas
      dockerfile: Dockerfile
    container_name: deltas-api
    restart: unless-stopped
    ports:
${ports}
    env_file:
      - ./deltas/.env
    environment:
      NODE_ENV: production
      PORT: 3000
    depends_on:
      ${config.services.postgres?.enabled ? '- db\n      ' : ''}${config.services.redis?.enabled ? '- redis\n      ' : ''}${config.services.clickhouse?.enabled ? '- clickhouse' : ''}
    networks:
      - deltas-network
    # Optimizations for high-throughput ingestion
    ulimits:
      nofile:
        soft: 65536
        hard: 65536`);
    }

    // Deltas App
    if (config.services.app?.enabled) {
        const appPort = config.services.app.config.APP_PORT || "5173";
        const ports = config.services.app.exposed
            ? `      - "${appPort}:5173"`
            : `      - "127.0.0.1:${appPort}:5173"`;

        services.push(`
  # Deltas App - SvelteKit Frontend
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    container_name: deltas-app
    restart: unless-stopped
    ports:
${ports}
    env_file:
      - ./app/.env
    environment:
      NODE_ENV: production
      PORT: 5173
    depends_on:
      ${config.services.api?.enabled ? '- api' : ''}
    networks:
      - deltas-network`);
    }

    // PostgreSQL
    if (config.services.postgres?.enabled) {
        const ports = config.services.postgres.exposed
            ? '      - "5432:5432"'
            : '      - "127.0.0.1:5432:5432"';
        services.push(`
  # PostgreSQL - Primary Database
  db:
    image: postgres:16-alpine
    container_name: deltas-postgres
    restart: unless-stopped
    ports:
${ports}
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
      # Performance tuning for high write throughput
      POSTGRES_SHARED_BUFFERS: 256MB
      POSTGRES_MAX_CONNECTIONS: 200
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - deltas-network
    command:
      - "postgres"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "effective_cache_size=1GB"
      - "-c"
      - "maintenance_work_mem=64MB"
      - "-c"
      - "checkpoint_completion_target=0.9"
      - "-c"
      - "wal_buffers=16MB"
      - "-c"
      - "default_statistics_target=100"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "effective_io_concurrency=200"
      - "-c"
      - "work_mem=2621kB"
      - "-c"
      - "min_wal_size=1GB"
      - "-c"
      - "max_wal_size=4GB"`);
    }

    // Redis
    if (config.services.redis?.enabled) {
        const ports = config.services.redis.exposed
            ? '      - "6379:6379"'
            : '      - "127.0.0.1:6379:6379"';
        services.push(`
  # Redis - Cache & Message Broker
  redis:
    image: redis:7-alpine
    container_name: deltas-redis
    restart: unless-stopped
    ports:
${ports}
    volumes:
      - redis_data:/data
    networks:
      - deltas-network
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru`);
    }

    // ClickHouse
    if (config.services.clickhouse?.enabled) {
        const httpPort = config.services.clickhouse.exposed
            ? '      - "8123:8123"'
            : '      - "127.0.0.1:8123:8123"';
        const nativePort = config.services.clickhouse.exposed
            ? '      - "19000:9000"'
            : '      - "127.0.0.1:19000:9000"';
        services.push(`
  # ClickHouse - Analytics Database for Events/Logs
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    container_name: deltas-clickhouse
    restart: unless-stopped
    ports:
${httpPort}
${nativePort}
    environment:
      CLICKHOUSE_DB: \${CLICKHOUSE_DATABASE:-default}
      CLICKHOUSE_USER: \${CLICKHOUSE_USER:-default}
      CLICKHOUSE_PASSWORD: \${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - clickhouse_logs:/var/log/clickhouse-server
    networks:
      - deltas-network
    ulimits:
      nofile:
        soft: 262144
        hard: 262144`);
    }

    // MinIO
    if (config.services.minio?.enabled) {
        const apiPort = config.services.minio.exposed
            ? '      - "9000:9000"'
            : '      - "127.0.0.1:9000:9000"';
        const consolePort = config.services.minio.exposed
            ? '      - "9001:9001"'
            : '      - "127.0.0.1:9001:9001"';
        services.push(`
  # MinIO - S3-Compatible Object Storage
  minio:
    image: minio/minio:latest
    container_name: deltas-minio
    restart: unless-stopped
    ports:
${apiPort}
${consolePort}
    environment:
      MINIO_ROOT_USER: \${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: \${S3_SECRET_KEY}
    volumes:
      - minio_data:/data
    networks:
      - deltas-network
    command: server /data --console-address ":9001"`);
    }

    // Volumes
    const volumes: string[] = [];
    if (config.services.nginx?.enabled) volumes.push("  nginx_logs:\n    driver: local");
    if (config.services.postgres?.enabled) volumes.push("  pgdata:\n    driver: local");
    if (config.services.redis?.enabled) volumes.push("  redis_data:\n    driver: local");
    if (config.services.clickhouse?.enabled) {
        volumes.push("  clickhouse_data:\n    driver: local");
        volumes.push("  clickhouse_logs:\n    driver: local");
    }
    if (config.services.minio?.enabled) volumes.push("  minio_data:\n    driver: local");

    let yaml = `# Deltas - High Performance Event Ingestion Platform
# Generated by Deltas Setup Wizard

services:\n${services.join("\n")}

networks:
  deltas-network:
    driver: bridge`;

    if (volumes.length > 0) {
        yaml += `\n\nvolumes:\n${volumes.join("\n")}`;
    }

    return yaml;
}

// Generate .env
function generateEnvFile(config: EnvConfig): string {
    const lines: string[] = [];

    lines.push("# Deltas Configuration");
    lines.push("# Generated by Deltas Setup Wizard");
    lines.push("");

    lines.push("# Drizzle");
    lines.push(`DATABASE_URL="${config.databaseUrl}"`);
    lines.push("");

    lines.push("# Application");
    lines.push(`ORIGIN="${config.origin}"`);
    lines.push("");

    lines.push("# Better Auth");
    lines.push(`BETTER_AUTH_SECRET="${config.betterAuthSecret}"`);
    lines.push("");

    lines.push("# Admin User");
    lines.push(`ADMIN_EMAIL="${config.adminEmail}"`);
    lines.push(`ADMIN_PASSWORD="${config.adminPassword}"`);
    lines.push("");

    lines.push("# Organization");
    lines.push(`ORG_NAME="${config.orgName}"`);
    lines.push("");

    // Always include Redis
    lines.push("# Redis");
    if (config.services.redis?.enabled) {
        lines.push('REDIS_URL="redis://redis:6379"');
    } else if (config.services.redis?.config.REDIS_URL) {
        lines.push(`REDIS_URL="${config.services.redis.config.REDIS_URL}"`);
    } else {
        lines.push('REDIS_URL=""');
    }
    lines.push("");

    // Always include ClickHouse
    lines.push("# ClickHouse");
    if (config.services.clickhouse?.enabled) {
        lines.push('CLICKHOUSE_HOST="clickhouse"');
        lines.push('CLICKHOUSE_PORT="8123"');
        lines.push('CLICKHOUSE_NATIVE_PORT="19000"');
        lines.push('CLICKHOUSE_USER="default"');
        lines.push(`CLICKHOUSE_PASSWORD="${config.services.clickhouse.config.CLICKHOUSE_PASSWORD}"`);
        lines.push('CLICKHOUSE_DATABASE="default"');
    } else if (config.services.clickhouse?.config) {
        lines.push(`CLICKHOUSE_HOST="${config.services.clickhouse.config.CLICKHOUSE_HOST}"`);
        lines.push(`CLICKHOUSE_PORT="${config.services.clickhouse.config.CLICKHOUSE_PORT}"`);
        lines.push(`CLICKHOUSE_NATIVE_PORT="${config.services.clickhouse.config.CLICKHOUSE_NATIVE_PORT}"`);
        lines.push(`CLICKHOUSE_USER="${config.services.clickhouse.config.CLICKHOUSE_USER}"`);
        lines.push(`CLICKHOUSE_PASSWORD="${config.services.clickhouse.config.CLICKHOUSE_PASSWORD}"`);
        lines.push(`CLICKHOUSE_DATABASE="${config.services.clickhouse.config.CLICKHOUSE_DATABASE}"`);
    } else {
        lines.push('CLICKHOUSE_HOST=""');
        lines.push('CLICKHOUSE_PORT=""');
        lines.push('CLICKHOUSE_NATIVE_PORT=""');
        lines.push('CLICKHOUSE_USER=""');
        lines.push('CLICKHOUSE_PASSWORD=""');
        lines.push('CLICKHOUSE_DATABASE=""');
    }
    lines.push("");

    // Always include MinIO (S3)
    lines.push("# MinIO (S3)");
    if (config.services.minio?.enabled) {
        lines.push('S3_ENDPOINT="http://minio:9000"');
        lines.push(`S3_ACCESS_KEY="${config.services.minio.config.S3_ACCESS_KEY}"`);
        lines.push(`S3_SECRET_KEY="${config.services.minio.config.S3_SECRET_KEY}"`);
        lines.push(`S3_BUCKET="${config.services.minio.config.S3_BUCKET}"`);
    } else if (config.services.minio?.config) {
        lines.push(`S3_ENDPOINT="${config.services.minio.config.S3_ENDPOINT}"`);
        lines.push(`S3_ACCESS_KEY="${config.services.minio.config.S3_ACCESS_KEY}"`);
        lines.push(`S3_SECRET_KEY="${config.services.minio.config.S3_SECRET_KEY}"`);
        lines.push(`S3_BUCKET="${config.services.minio.config.S3_BUCKET}"`);
    } else {
        lines.push('S3_ENDPOINT=""');
        lines.push('S3_ACCESS_KEY=""');
        lines.push('S3_SECRET_KEY=""');
        lines.push('S3_BUCKET=""');
    }
    lines.push("");

    // Always include SMTP variables
    lines.push("# Mailpit (SMTP)");
    lines.push(`SMTP_HOST="${config.smtpHost}"`);
    lines.push(`SMTP_PORT="${config.smtpPort}"`);
    lines.push(`SMTP_FROM="${config.smtpFrom}"`);
    lines.push(`SMTP_USER="${config.smtpUser}"`);
    lines.push(`SMTP_PASSWORD="${config.smtpPassword}"`);
    lines.push("");

    if (config.services.postgres?.enabled) {
        lines.push("# PostgreSQL");
        lines.push(`POSTGRES_USER="${config.services.postgres.config.POSTGRES_USER}"`);
        lines.push(`POSTGRES_PASSWORD="${config.services.postgres.config.POSTGRES_PASSWORD}"`);
        lines.push(`POSTGRES_DB="${config.services.postgres.config.POSTGRES_DB}"`);
        lines.push("");
    }


    return lines.join("\n");
}

// Save files
async function saveFiles(
    config: EnvConfig,
    dockerCompose: string,
    envContent: string,
    nginxConf: string
) {
    const spinner = ora("Saving configuration files...").start();

    try {
        const cwd = process.cwd();

        // Docker Compose
        await fs.writeFile(path.join(cwd, "docker-compose.yaml"), dockerCompose);
        spinner.text = "✓ docker-compose.yaml";
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Nginx config
        if (config.services.nginx?.enabled) {
            await fs.writeFile(path.join(cwd, "nginx.conf"), nginxConf);
            spinner.text = "✓ nginx.conf";
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // .env files (create directories if they don't exist)
        await fs.mkdir(path.join(cwd, "app"), { recursive: true });
        await fs.writeFile(path.join(cwd, "app", ".env"), envContent);
        spinner.text = "✓ app/.env";
        await new Promise((resolve) => setTimeout(resolve, 200));

        await fs.mkdir(path.join(cwd, "deltas"), { recursive: true });
        await fs.writeFile(path.join(cwd, "deltas", ".env"), envContent);
        spinner.text = "✓ deltas/.env";

        spinner.succeed(chalk.green("All files saved!"));

        console.log(chalk.gray("\n📁 Files created:"));
        console.log(chalk.green("  ✓ docker-compose.yaml"));
        if (config.services.nginx?.enabled) console.log(chalk.green("  ✓ nginx.conf"));
        console.log(chalk.green("  ✓ app/.env"));
        console.log(chalk.green("  ✓ deltas/.env"));
    } catch (error) {
        spinner.fail("Failed to save files");
        throw error;
    }
}

// Main
async function main() {
    try {
        await showBanner();

        const envCheck = await checkExistingEnv();
        let existingEnv: Record<string, string> = {};

        if (!envCheck.shouldReplace && (envCheck.appExists || envCheck.deltasExists)) {
            const spinner = ora("Loading existing configuration...").start();
            if (envCheck.existingAppEnv) {
                existingEnv = parseEnvFile(envCheck.existingAppEnv);
            } else if (envCheck.existingDeltasEnv) {
                existingEnv = parseEnvFile(envCheck.existingDeltasEnv);
            }
            spinner.succeed("Configuration loaded!");
            console.log(chalk.gray("Using existing values as defaults\n"));
        }

        showSection("⚙️", "Basic Configuration");
        const origin = await input({
            message: "Application origin URL:",
            default: existingEnv.ORIGIN || "http://localhost:5173",
        });

        const betterAuthSecret = existingEnv.BETTER_AUTH_SECRET || await generateSecret();

        const adminConfig = await configureAdmin(existingEnv);

        // Configure Deltas services
        const api = await configureDeltasAPI(existingEnv);
        const app = await configureDeltasApp(existingEnv);
        const nginx = await configureNginx(!!api, !!app);

        // Configure infrastructure
        const postgres = await configurePostgres(existingEnv);
        const redis = await configureRedis(existingEnv);
        const clickhouse = await configureClickHouse(existingEnv);
        const minio = await configureMinIO(existingEnv);
        const smtp = await configureSMTP(existingEnv);

        // Build DATABASE_URL correctly
        let databaseUrl = "";
        if (postgres?.enabled) {
            // For local Docker deployment, use "db" service name for container-to-container communication
            databaseUrl = `postgres://${postgres.config.POSTGRES_USER}:${postgres.config.POSTGRES_PASSWORD}@db:5432/${postgres.config.POSTGRES_DB}`;
        } else if (postgres?.config.DATABASE_URL) {
            databaseUrl = postgres.config.DATABASE_URL;
        }

        const config: EnvConfig = {
            services: {
                ...(api && { api }),
                ...(app && { app }),
                ...(nginx && { nginx }),
                ...(postgres && { postgres }),
                ...(redis && { redis }),
                ...(clickhouse && { clickhouse }),
                ...(minio && { minio }),
            },
            betterAuthSecret,
            databaseUrl,
            origin,
            adminEmail: adminConfig.email,
            adminPassword: adminConfig.password,
            orgName: adminConfig.orgName,
            smtpHost: smtp.host,
            smtpPort: smtp.port,
            smtpFrom: smtp.from,
            smtpUser: smtp.user,
            smtpPassword: smtp.password,
        };

        console.log();
        const spinner = ora("Generating configuration...").start();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        spinner.succeed("Configuration generated!");

        const dockerCompose = generateDockerCompose(config);
        const envContent = generateEnvFile(config);
        const nginxConf = nginx ? generateNginxConf(config) : "";

        await saveFiles(config, dockerCompose, envContent, nginxConf);

        console.log(chalk.cyan("\n" + "━".repeat(60)));
        console.log(chalk.green("✨ Setup Complete!"));
        console.log(chalk.cyan("━".repeat(60)));

        console.log(chalk.white("\n📋 Next steps:"));
        console.log(chalk.yellow("  1.") + " Review configuration files");
        console.log(chalk.yellow("  2.") + " Run " + chalk.cyan("docker-compose up -d"));
        console.log(chalk.yellow("  3.") + " Check logs with " + chalk.cyan("docker-compose logs -f"));

        console.log(chalk.white("\n🚀 Enabled services:"));
        if (nginx) console.log(chalk.green("  ✓ Nginx") + chalk.gray(" (reverse proxy)"));
        if (api) console.log(chalk.green("  ✓ Deltas API") + chalk.gray(" (event ingestion)"));
        if (app) console.log(chalk.green("  ✓ Deltas App") + chalk.gray(" (frontend)"));
        if (postgres?.enabled) console.log(chalk.green("  ✓ PostgreSQL") + chalk.gray(" (database)"));
        if (redis?.enabled) console.log(chalk.green("  ✓ Redis") + chalk.gray(" (cache)"));
        if (clickhouse?.enabled) console.log(chalk.green("  ✓ ClickHouse") + chalk.gray(" (analytics)"));
        if (minio?.enabled) console.log(chalk.green("  ✓ MinIO") + chalk.gray(" (storage)"));

        console.log(chalk.cyan("\n" + "━".repeat(60) + "\n"));
    } catch (error) {
        if (error instanceof Error && error.message.includes("User force closed")) {
            console.log(chalk.yellow("\n👋 Setup cancelled"));
            process.exit(0);
        }
        console.error(chalk.red("\n❌ Setup failed:"), error);
        process.exit(1);
    }
}

main();