import app from "./app";
import { logger } from "./lib/logger";
import { autoSeedIfEmpty } from "./lib/auto-seed";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      plan VARCHAR(50) NOT NULL DEFAULT 'basic',
      max_units INTEGER NOT NULL DEFAULT 50,
      max_users INTEGER NOT NULL DEFAULT 10,
      is_active BOOLEAN NOT NULL DEFAULT true,
      settings JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'reception',
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      property_id INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'hotel',
      description TEXT,
      address TEXT,
      settings JSONB,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'room',
      capacity INTEGER NOT NULL DEFAULT 2,
      floor INTEGER,
      base_price NUMERIC(10, 2),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      housekeeping_status VARCHAR(50) NOT NULL DEFAULT 'clean',
      amenities JSONB,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guests (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      nationality VARCHAR(100),
      date_of_birth DATE,
      document_type VARCHAR(50),
      document_number VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      guest_id INTEGER NOT NULL REFERENCES guests(id),
      check_in DATE NOT NULL,
      check_out DATE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      payment_status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
      source VARCHAR(50) NOT NULL DEFAULT 'direct',
      guests_count INTEGER NOT NULL DEFAULT 1,
      total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      priority VARCHAR(50) NOT NULL DEFAULT 'medium',
      assigned_to INTEGER REFERENCES users(id),
      checklist JSONB,
      due_date DATE,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rates (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      name VARCHAR(255) NOT NULL,
      property_id INTEGER,
      category VARCHAR(100),
      base_price NUMERIC(10, 2) NOT NULL,
      weekend_price NUMERIC(10, 2),
      seasonal_prices JSONB,
      min_stay INTEGER NOT NULL DEFAULT 1,
      promo_code VARCHAR(50),
      discount_percent NUMERIC(5, 2),
      valid_from DATE,
      valid_to DATE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS addons (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(10, 2) NOT NULL,
      unit VARCHAR(50) NOT NULL DEFAULT 'per stay',
      max_quantity INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_addons (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      addon_id INTEGER NOT NULL REFERENCES addons(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      price NUMERIC(10, 2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      method VARCHAR(50) NOT NULL DEFAULT 'cash',
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      reference VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
}

async function bootstrap() {
  try {
    logger.info("Ensuring database schema...");
    await ensureSchema();
    logger.info("Schema ready.");

    await autoSeedIfEmpty();
  } catch (err) {
    logger.error({ err }, "Bootstrap error");
  }

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  // Graceful shutdown — release port before exit so restarts never hit EADDRINUSE
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutdown signal received, closing server...");
    server.close(() => {
      logger.info("Server closed.");
      process.exit(0);
    });
    // Force-exit after 5s if connections are still open
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

bootstrap();
