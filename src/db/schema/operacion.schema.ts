import { pgTable, text, integer, boolean, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { platoCarta } from "./catalogo.schema";

/**
 * OPERACION
 * ---------
 * Modela el flujo real: mesero ocupa una mesa -> toma uno o varios
 * pedidos (rondas) durante la visita -> cocina prepara -> mesero entrega
 * -> caja cobra el total de la visita -> mesa se libera.
 *
 * Jerarquia: Mesa -> VisitaMesa (una "sesion" por cliente/grupo) -> Pedido
 * (una ronda dentro de esa sesion) -> ItemPedido (cada plato pedido).
 *
 * Se eligio "varios pedidos por visita" porque el cliente puede pedir
 * algo, comer, y luego pedir mas -> son rondas separadas, pero todas
 * deben sumarse en un solo total al momento de pagar en caja.
 */

export const estadoMesaEnum = pgEnum("estado_mesa", ["libre", "ocupada"]);

export const mesa = pgTable("mesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  numero: integer("numero").notNull().unique(), // ej. 1, 2, 3...
  estado: estadoMesaEnum("estado").notNull().default("libre"),
  capacidad: integer("capacidad"), // opcional, num. de personas

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- Visita de mesa: agrupa todas las rondas de un mismo cliente/grupo ---
// Se abre cuando el mesero marca la mesa como ocupada (paso 1 del flujo).
// Se cierra cuando caja libera la mesa (paso 9 del flujo).
export const estadoVisitaEnum = pgEnum("estado_visita", ["abierta", "cerrada"]);

export const visitaMesa = pgTable("visita_mesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  mesaId: uuid("mesa_id").notNull().references(() => mesa.id, { onDelete: "restrict" }),

  abiertaPorUsuarioId: text("abierta_por_usuario_id").notNull().references(() => user.id), // mesero
  estado: estadoVisitaEnum("estado").notNull().default("abierta"),
  paraLlevar: boolean("para_llevar").notNull().default(false), // pedido para llevar (+S/1 por plato elegible)

  fechaApertura: timestamp("fecha_apertura").notNull().defaultNow(),
  fechaCierre: timestamp("fecha_cierre"), // null mientras este abierta
});

// --- Pedido: una ronda dentro de una visita ---
export const estadoPedidoEnum = pgEnum("estado_pedido", [
  "pendiente", // tomado por el mesero, recien enviado a cocina
  "en_preparacion", // opcional: cocina ya lo esta cocinando (si se quiere distinguir de "pendiente")
  "listo", // cocina toco el timbre
  "entregado", // mesero ya lo entrego al cliente
  "cancelado", // por si se anula una ronda completa
]);

export const pedido = pgTable("pedido", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitaMesaId: uuid("visita_mesa_id").notNull().references(() => visitaMesa.id, { onDelete: "restrict" }),
  tomadoPorUsuarioId: text("tomado_por_usuario_id").notNull().references(() => user.id), // mesero

  estado: estadoPedidoEnum("estado").notNull().default("pendiente"),

  fechaCreacion: timestamp("fecha_creacion").notNull().defaultNow(),
  fechaListo: timestamp("fecha_listo"), // cuando cocina toco el timbre
  fechaEntregado: timestamp("fecha_entregado"), // cuando el mesero lo entrego
});

// --- Item de pedido: cada plato dentro de una ronda, con su personalizacion ---
export const estadoItemPedidoEnum = pgEnum("estado_item_pedido", [
  "pendiente",
  "listo",
  "entregado",
  "cancelado",
]);

export const itemPedido = pgTable("item_pedido", {
  id: uuid("id").primaryKey().defaultRandom(),
  pedidoId: uuid("pedido_id").notNull().references(() => pedido.id, { onDelete: "cascade" }),
  platoCartaId: uuid("plato_carta_id").notNull().references(() => platoCarta.id, { onDelete: "restrict" }),

  cantidad: integer("cantidad").notNull().default(1),

  // Precio del plato AL MOMENTO de pedirlo. Se copia desde plato_carta.precio
  // para que si el precio de la carta cambia despues, el historico no se altere.
  precioUnitarioCongelado: text("precio_unitario_congelado").notNull(),

  // Personalizacion en texto libre: "sin crema", "sin aji", "sin arroz", etc.
  // No se modela como opciones estructuradas de la carta -- es una nota
  // operativa del mesero, no una variante de producto con su propio precio.
  notas: text("notas"),

  estado: estadoItemPedidoEnum("estado").notNull().default("pendiente"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
