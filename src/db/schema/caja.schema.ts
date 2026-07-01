import { pgTable, text, numeric, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { visitaMesa } from "./operacion.schema";

/**
 * CAJA
 * ----
 * Modela los turnos de caja (mañana/tarde, cada uno con su propio
 * cajero) y los pagos, que quedan SIEMPRE asociados a un turno
 * especifico -- no solo a una fecha -- para poder rastrear de quien
 * es responsable cada monto si hay una diferencia en el cuadre.
 */

export const estadoTurnoEnum = pgEnum("estado_turno_caja", ["abierto", "cerrado"]);

export const turnoCaja = pgTable("turno_caja", {
  id: uuid("id").primaryKey().defaultRandom(),
  cajeroUsuarioId: text("cajero_usuario_id").notNull().references(() => user.id),

  estado: estadoTurnoEnum("estado").notNull().default("abierto"),

  montoApertura: numeric("monto_apertura", { precision: 10, scale: 2 }).notNull(),

  // Calculado al cierre: monto_apertura + total de pagos en efectivo del turno.
  montoCierreTeorico: numeric("monto_cierre_teorico", { precision: 10, scale: 2 }),

  // Ingresado a mano por el cajero al contar el efectivo fisico.
  montoCierreReal: numeric("monto_cierre_real", { precision: 10, scale: 2 }),

  // montoCierreReal - montoCierreTeorico. Positivo = sobrante, negativo = faltante.
  diferencia: numeric("diferencia", { precision: 10, scale: 2 }),

  fechaApertura: timestamp("fecha_apertura").notNull().defaultNow(),
  fechaCierre: timestamp("fecha_cierre"),
});

export const metodoPagoEnum = pgEnum("metodo_pago", ["efectivo", "tarjeta", "yape_plin", "transferencia"]);

// --- Pago: registra el cobro de una visita de mesa completa (todas sus rondas) ---
export const pago = pgTable("pago", {
  id: uuid("id").primaryKey().defaultRandom(),

  // A que turno pertenece este pago. Es la clave para la trazabilidad
  // por cajero, en vez de depender solo de la fecha.
  turnoCajaId: uuid("turno_caja_id").notNull().references(() => turnoCaja.id, { onDelete: "restrict" }),

  // Que visita de mesa se esta pagando (incluye todas sus rondas/pedidos).
  visitaMesaId: uuid("visita_mesa_id").notNull().references(() => visitaMesa.id, { onDelete: "restrict" }),

  registradoPorUsuarioId: text("registrado_por_usuario_id").notNull().references(() => user.id), // cajero

  metodoPago: metodoPagoEnum("metodo_pago").notNull(),
  montoTotal: numeric("monto_total", { precision: 10, scale: 2 }).notNull(),

  // Ajuste manual aplicado al total de la visita por decisión del cajero (ej.
  // delivery con costo distinto, redondeo, descuento de cortesía). Se guarda
  // SOLO en la primera fila de pago de la visita (las demás van en NULL) para
  // tener un registro único auditable de quién ajustó y por qué. Positivo
  // significa que se cobró más que el total de items; negativo, menos.
  ajusteMonto: numeric("ajuste_monto", { precision: 10, scale: 2 }),
  motivoAjuste: text("motivo_ajuste"),

  fechaPago: timestamp("fecha_pago").notNull().defaultNow(),
});

export const gasto = pgTable("gasto", {
  id: uuid("id").primaryKey().defaultRandom(),
  turnoCajaId: uuid("turno_caja_id").notNull().references(() => turnoCaja.id, { onDelete: "restrict" }),
  cajeroUsuarioId: text("cajero_usuario_id").notNull().references(() => user.id),
  monto: numeric("monto", { precision: 10, scale: 2 }).notNull(),
  motivo: text("motivo").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
