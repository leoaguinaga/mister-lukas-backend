import { pgTable, text, integer, numeric, boolean, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";

/**
 * CATALOGO
 * --------
 * Aqui vive la carta del restaurante y todo lo relacionado a como
 * cada plato afecta (o no) el inventario.
 *
 * Categorias de producto (decididas en la fase de analisis):
 *   A: insumo unico fraccionable (ej. pollo a la brasa por 1/8, 1/4, 1/2, entero)
 *      -> descuento automatico via receta, en la unidad minima fraccionable.
 *   B: reventa directa (ej. gaseosas, bebidas embotelladas)
 *      -> descuento automatico 1:1, sin receta.
 *   C: multi-insumo / preparacion libre (ej. lomo saltado, parrillas, pastas)
 *      -> NO se descuenta stock automaticamente. Solo se marca
 *         disponible/no disponible manualmente.
 */

export const categoriaInventarioEnum = pgEnum("categoria_inventario", [
  "fraccionable", // A
  "reventa", // B
  "multi_insumo", // C
]);

// --- Insumos (solo aplica a categorias A y B) ---
// Para "pollo a la brasa", este es el registro de "pollo_entero",
// con su stock SIEMPRE expresado en la unidad minima fraccionable
// (ej. octavos), nunca en unidades enteras con resto decimal.
export const insumo = pgTable("insumo", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(), // ej. "Pollo entero", "Gaseosa Inca Kola 500ml"

  // Cuantas "unidades minimas" componen una unidad de compra.
  // Para pollo: 8 (octavos). Para una gaseosa: 1 (no es fraccionable,
  // cada botella vendida es 1 unidad consumida).
  unidadesPorUnidadDeCompra: integer("unidades_por_unidad_compra").notNull().default(1),

  // Nombre de la unidad minima, solo para mostrar en UI (ej. "octavo", "botella")
  nombreUnidadMinima: text("nombre_unidad_minima").notNull().default("unidad"),

  stockActual: integer("stock_actual").notNull().default(0), // en unidad minima
  activo: boolean("activo").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- Carta: platos / productos que el mesero puede pedir ---
export const platoCarta = pgTable("plato_carta", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(), // ej. "1/4 Pollo a la brasa", "Lomo saltado", "Inca Kola 500ml"
  descripcion: text("descripcion"),
  precio: numeric("precio", { precision: 10, scale: 2 }).notNull(),
  categoriaInventario: categoriaInventarioEnum("categoria_inventario").notNull(),

  // Disponibilidad manual. Para categoria C, este es el UNICO mecanismo
  // de control de stock: cocina avisa -> mesero/caja marca este campo.
  // Para A y B tambien existe (ej. se acabaron las gaseosas), pero ahi
  // normalmente lo dispara el propio sistema cuando stock llega a 0.
  disponible: boolean("disponible").notNull().default(true),

  activo: boolean("activo").notNull().default(true), // soft-delete del plato (deja de ofrecerse, no se borra historial)

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- Receta: cuanto consume un plato de un insumo (solo categorias A/B) ---
// Un plato de categoria A/B tiene exactamente UNA fila aqui (un solo insumo).
// Categoria C no tiene filas en esta tabla (por diseno: no se modela su receta).
export const recetaPlato = pgTable("receta_plato", {
  id: uuid("id").primaryKey().defaultRandom(),
  platoCartaId: uuid("plato_carta_id").notNull().references(() => platoCarta.id, { onDelete: "cascade" }),
  insumoId: uuid("insumo_id").notNull().references(() => insumo.id, { onDelete: "restrict" }),

  // Cuantas unidades minimas del insumo consume este plato.
  // "1/8 pollo" -> 1. "1/4 pollo" -> 2. "Pollo entero" -> 8. "Gaseosa" -> 1.
  cantidadConsumida: integer("cantidad_consumida").notNull(),
});
