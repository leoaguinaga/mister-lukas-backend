import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Tablas requeridas por Better Auth (https://www.better-auth.com).
 * No se renombran columnas ni tablas: Better Auth las espera con estos
 * nombres exactos para su adapter de Drizzle/Postgres.
 *
 * Se añade un único campo propio: `role`, que es la forma "simple"
 * que decidimos usar para Mesero / Cajero / Administracion, en vez
 * de un sistema de roles y permisos separado.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),

  // --- Campo propio del negocio ---
  // Rol operativo dentro del restaurante. Cocina no tiene usuario
  // porque no accede al sistema (interactua solo via comandas impresas).
  role: text("role", { enum: ["mesero", "cajero", "administracion"] }).notNull(),

  // Permite desactivar a un usuario (ej. un mesero que ya no trabaja ahi)
  // sin borrar su historial de pedidos/pagos asociados.
  activo: boolean("activo").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
