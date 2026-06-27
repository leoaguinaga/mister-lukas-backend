import { pgTable, text, integer, numeric, boolean, timestamp, uuid, pgEnum, time, date, primaryKey } from "drizzle-orm/pg-core";
import { platoCarta } from "./catalogo.schema";

/**
 * PROMOCIONES
 * -----------
 * Descuentos aplicables a un conjunto de platos en días/horas determinados.
 * Resolución al crear pedido: para cada item se busca una promo activa cuyo
 * día de semana (y hora si aplica) coincida con `now()` y cuyo plato esté
 * en `promocion_plato`. Se aplica el descuento sobre el precio del plato
 * (después del recargo "para llevar", si lo hubiera).
 *
 * Una promo por item — no se acumulan. Si hay varias vigentes, gana la
 * primera por orden de creación (createdAt asc).
 */

export const tipoDescuentoEnum = pgEnum("tipo_descuento", ["porcentaje", "monto_fijo"]);

export const promocion = pgTable("promocion", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(), // ej. "Martes y jueves polleros"
  descripcion: text("descripcion"),

  tipoDescuento: tipoDescuentoEnum("tipo_descuento").notNull(),
  // Para porcentaje: 0-100 (ej. 15 = 15%). Para monto_fijo: soles por unidad (ej. 2.00).
  valorDescuento: numeric("valor_descuento", { precision: 10, scale: 2 }).notNull(),

  // Días de semana en formato ISO (1=lunes, 2=martes, ..., 7=domingo) almacenados como CSV.
  // Ej.: "2,4" = martes y jueves. Se valida y normaliza en el service.
  diasSemana: text("dias_semana").notNull(),

  // Rango horario opcional dentro del día (formato HH:MM:SS). Null = todo el día.
  horaInicio: time("hora_inicio"),
  horaFin: time("hora_fin"),

  // Rango de vigencia opcional. Null = sin límite.
  vigenteDesde: date("vigente_desde"),
  vigenteHasta: date("vigente_hasta"),

  activo: boolean("activo").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const promocionPlato = pgTable("promocion_plato", {
  promocionId: uuid("promocion_id").notNull().references(() => promocion.id, { onDelete: "cascade" }),
  platoCartaId: uuid("plato_carta_id").notNull().references(() => platoCarta.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.promocionId, t.platoCartaId] }),
}));
