import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../db/db.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

// Añade stockActual a los platos A/B a través de su receta + insumo
async function enrichWithStock(
  platos: (typeof schema.platoCarta.$inferSelect)[],
  db: NodePgDatabase<typeof schema>,
) {
  if (!platos.length) return platos.map((p) => ({ ...p, stockActual: null as number | null, nombreUnidadMinima: null as string | null }));

  const platoIds = platos.map((p) => p.id);
  const recetas  = await db
    .select({
      platoCartaId:      schema.recetaPlato.platoCartaId,
      cantidadConsumida: schema.recetaPlato.cantidadConsumida,
      stockActual:       schema.insumo.stockActual,
      nombreUnidadMinima: schema.insumo.nombreUnidadMinima,
    })
    .from(schema.recetaPlato)
    .innerJoin(schema.insumo, eq(schema.recetaPlato.insumoId, schema.insumo.id))
    .where(eq(schema.recetaPlato.platoCartaId, platoIds[0]));

  // Fetch en lote: una query por plato es costoso; hacemos un join simple y filtramos en JS
  const todasRecetas = await db
    .select({
      platoCartaId:       schema.recetaPlato.platoCartaId,
      cantidadConsumida:  schema.recetaPlato.cantidadConsumida,
      stockActual:        schema.insumo.stockActual,
      nombreUnidadMinima: schema.insumo.nombreUnidadMinima,
    })
    .from(schema.recetaPlato)
    .innerJoin(schema.insumo, eq(schema.recetaPlato.insumoId, schema.insumo.id));

  const recetaMap = new Map(todasRecetas.map((r) => [r.platoCartaId, r]));
  void recetas;

  return platos.map((p) => {
    const receta = recetaMap.get(p.id);
    return {
      ...p,
      stockActual:        receta ? receta.stockActual : null,
      nombreUnidadMinima: receta ? receta.nombreUnidadMinima : null,
    };
  });
}

@Injectable()
export class CatalogoService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  // ─── Insumos ───

  async findAllInsumos() {
    return this.db.select().from(schema.insumo).where(eq(schema.insumo.activo, true));
  }

  async findInsumoById(id: string) {
    const [row] = await this.db.select().from(schema.insumo).where(eq(schema.insumo.id, id));
    if (!row) throw new NotFoundException('Insumo no encontrado');
    return row;
  }

  async createInsumo(data: {
    nombre: string;
    unidadesPorUnidadDeCompra?: number;
    nombreUnidadMinima?: string;
    stockActual?: number;
  }) {
    const [row] = await this.db.insert(schema.insumo).values(data).returning();
    return row;
  }

  async updateInsumo(id: string, data: Partial<{
    nombre: string;
    unidadesPorUnidadDeCompra: number;
    nombreUnidadMinima: string;
    stockActual: number;
    activo: boolean;
  }>) {
    const [row] = await this.db.update(schema.insumo).set(data).where(eq(schema.insumo.id, id)).returning();
    if (!row) throw new NotFoundException('Insumo no encontrado');
    return row;
  }

  // ─── Platos ───

  async findAllPlatos() {
    const rows = await this.db.select().from(schema.platoCarta).where(eq(schema.platoCarta.activo, true));
    return enrichWithStock(rows, this.db);
  }

  // Devuelve TODOS los platos activos con stock (disponible o no) para que el mesero vea el estado real
  async findPlatosDisponibles() {
    const rows = await this.db
      .select()
      .from(schema.platoCarta)
      .where(eq(schema.platoCarta.activo, true));
    return enrichWithStock(rows, this.db);
  }

  async findPlatoById(id: string) {
    const [row] = await this.db.select().from(schema.platoCarta).where(eq(schema.platoCarta.id, id));
    if (!row) throw new NotFoundException('Plato no encontrado');
    return row;
  }

  async createPlato(data: {
    nombre: string;
    precio: string;
    categoriaInventario: 'fraccionable' | 'reventa' | 'multi_insumo';
    descripcion?: string;
  }) {
    const [row] = await this.db.insert(schema.platoCarta).values(data).returning();
    return row;
  }

  async updatePlato(id: string, data: Partial<{
    nombre: string;
    precio: string;
    descripcion: string;
    categoriaInventario: 'fraccionable' | 'reventa' | 'multi_insumo';
    disponible: boolean;
    activo: boolean;
  }>) {
    const [row] = await this.db.update(schema.platoCarta).set(data).where(eq(schema.platoCarta.id, id)).returning();
    if (!row) throw new NotFoundException('Plato no encontrado');
    return row;
  }

  // ─── Recetas ───

  async findRecetasByPlato(platoCartaId: string) {
    return this.db.select().from(schema.recetaPlato).where(eq(schema.recetaPlato.platoCartaId, platoCartaId));
  }

  async createReceta(data: {
    platoCartaId: string;
    insumoId: string;
    cantidadConsumida: number;
  }) {
    const [row] = await this.db.insert(schema.recetaPlato).values(data).returning();
    return row;
  }

  async deleteReceta(id: string) {
    const [row] = await this.db.delete(schema.recetaPlato).where(eq(schema.recetaPlato.id, id)).returning();
    if (!row) throw new NotFoundException('Receta no encontrada');
    return row;
  }
}
