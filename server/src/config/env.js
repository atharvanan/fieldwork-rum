import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function secret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`${name} must be set in production`);
  return devFallback;
}

export const env = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fieldwork',
  accessSecret: secret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  refreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  ingestRatePerMin: Number(process.env.INGEST_RATE_PER_MIN) || 600,
  registerRatePerHour: Number(process.env.REGISTER_RATE_PER_HOUR) || 20,
  retentionDays: Number(process.env.RETENTION_DAYS) || 30,
};
