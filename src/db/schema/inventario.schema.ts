import { pgTable, text, integer, date, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { insumo } from "./catalogo.schema";

/**
 * INVENTARIO
 * ----------
 * El conteo fisico de stock (insumos categoria A y B) se hace UNA VEZ
 * AL DIA, no por turno -- decision tomada porque el stock de insumos
 * es continuo entre turnos (a diferencia del efectivo de caja, que si
 * cambia de responsable por turno).
 *
 * Flujo:
 *   1. Apertura del dia: se registra el stock inicial contado a mano.
 *   2. Durante el dia: las ventas descuentan solo (categoria A/B), via
 *      movimientoStock, sin intervencion humana.
 *   3. Cierre del dia: conteo fisico final. La diferencia contra el
 *      stock teorico (inicial - ventas) es la merma del dia.
 */

export const conteoStockDiario = pgTable("conteo_stock_diario", {
  id: uuid("id").primaryKey().defaultRandom(),
  insumoId: uuid("insumo_id").notNull().references(() => insumo.id, { onDelete: "restrict" }),
  fecha: date("fecha").notNull(),

  registradoPorUsuarioId: text("registrado_por_usuario_id").notNull().references(() => user.id),

  stockInicialContado: integer("stock_inicial_contado").notNull(),

  stockFinalTeorico: integer("stock_final_teorico"),
  stockFinalContado: integer("stock_final_contado"),
  merma: integer("merma"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tipoMovimientoStockEnum = pgEnum("tipo_movimiento_stock", [
  "venta",
  "ajuste_manual",
  "apertura_dia",
]);

export const movimientoStock = pgTable("movimiento_stock", {
  id: uuid("id").primaryKey().defaultRandom(),
  insumoId: uuid("insumo_id").notNull().references(() => insumo.id, { onDelete: "restrict" }),

  tipo: tipoMovimientoStockEnum("tipo").notNull(),

  cantidad: integer("cantidad").notNull(),

  itemPedidoId: uuid("item_pedido_id"),

  registradoPorUsuarioId: text("registrado_por_usuario_id").references(() => user.id),
  notas: text("notas"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const estadoSyncEnum = pgEnum("estado_sync", ["pendiente", "sincronizado", "error"]);

export const syncDiario = pgTable("sync_diario", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull().unique(),

  estado: estadoSyncEnum("estado").notNull().default("pendiente"),
  intentos: integer("intentos").notNull().default(0),
  ultimoError: text("ultimo_error"),

  sincronizadoEn: timestamp("sincronizado_en"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
