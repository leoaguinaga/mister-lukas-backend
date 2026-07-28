import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../db/db.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

type PlatoConCategoria = typeof schema.platoCarta.$inferSelect & {
  categoria: typeof schema.categoriaCarta.$inferSelect;
};

// Añade stockActual a los platos A/B a través de su receta + insumo
async function enrichWithStock(
  platos: PlatoConCategoria[],
  db: NodePgDatabase<typeof schema>,
) {
  if (!platos.length)
    return platos.map((p) => ({
      ...p,
      stockActual: null as number | null,
      nombreUnidadMinima: null as string | null,
    }));

  const todasRecetas = await db
    .select({
      platoCartaId: schema.recetaPlato.platoCartaId,
      cantidadConsumida: schema.recetaPlato.cantidadConsumida,
      stockActual: schema.insumo.stockActual,
      nombreUnidadMinima: schema.insumo.nombreUnidadMinima,
    })
    .from(schema.recetaPlato)
    .innerJoin(
      schema.insumo,
      eq(schema.recetaPlato.insumoId, schema.insumo.id),
    );

  const recetaMap = new Map(todasRecetas.map((r) => [r.platoCartaId, r]));

  return platos.map((p) => {
    const receta = recetaMap.get(p.id);
    return {
      ...p,
      stockActual:
        p.categoria?.descuentaStock && receta ? receta.stockActual : null,
      nombreUnidadMinima:
        p.categoria?.descuentaStock && receta ? receta.nombreUnidadMinima : null,
    };
  });
}

@Injectable()
export class CatalogoService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  // ─── Categorías ───

  async findAllCategorias() {
    return this.db
      .select()
      .from(schema.categoriaCarta)
      .where(eq(schema.categoriaCarta.activo, true))
      .orderBy(schema.categoriaCarta.orden);
  }

  async createCategoria(data: {
    nombre: string;
    slug: string;
    descuentaStock?: boolean;
    esParaCocina?: boolean;
    orden?: number;
  }) {
    const [row] = await this.db
      .insert(schema.categoriaCarta)
      .values(data)
      .returning();
    return row;
  }

  async updateCategoria(
    id: string,
    data: Partial<{
      nombre: string;
      slug: string;
      descuentaStock: boolean;
      esParaCocina: boolean;
      orden: number;
      activo: boolean;
    }>,
  ) {
    const [row] = await this.db
      .update(schema.categoriaCarta)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.categoriaCarta.id, id))
      .returning();
    if (!row) throw new NotFoundException('Categoría no encontrada');
    return row;
  }

  // ─── Insumos ───

  async findAllInsumos() {
    return this.db
      .select()
      .from(schema.insumo)
      .where(eq(schema.insumo.activo, true));
  }

  async findInsumoById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.insumo)
      .where(eq(schema.insumo.id, id));
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

  async updateInsumo(
    id: string,
    data: Partial<{
      nombre: string;
      unidadesPorUnidadDeCompra: number;
      nombreUnidadMinima: string;
      stockActual: number;
      activo: boolean;
    }>,
  ) {
    const [row] = await this.db
      .update(schema.insumo)
      .set(data)
      .where(eq(schema.insumo.id, id))
      .returning();
    if (!row) throw new NotFoundException('Insumo no encontrado');
    return row;
  }

  // ─── Platos ───

  async findAllPlatos() {
    const rows = await this.db
      .select({
        plato: schema.platoCarta,
        categoria: schema.categoriaCarta,
      })
      .from(schema.platoCarta)
      .leftJoin(
        schema.categoriaCarta,
        eq(schema.platoCarta.categoriaId, schema.categoriaCarta.id),
      )
      .where(eq(schema.platoCarta.activo, true));

    const platosFormatted = rows.map(({ plato, categoria }) => ({
      ...plato,
      categoria: categoria!,
    }));

    return enrichWithStock(platosFormatted, this.db);
  }

  // Devuelve TODOS los platos activos con stock (disponible o no) para que el mesero vea el estado real
  async findPlatosDisponibles() {
    return this.findAllPlatos();
  }

  async findPlatoById(id: string) {
    const [row] = await this.db
      .select({
        plato: schema.platoCarta,
        categoria: schema.categoriaCarta,
      })
      .from(schema.platoCarta)
      .leftJoin(
        schema.categoriaCarta,
        eq(schema.platoCarta.categoriaId, schema.categoriaCarta.id),
      )
      .where(eq(schema.platoCarta.id, id));

    if (!row || !row.plato) throw new NotFoundException('Plato no encontrado');
    return {
      ...row.plato,
      categoria: row.categoria!,
    };
  }

  async createPlato(data: {
    nombre: string;
    precio: string;
    categoriaId: string;
    descripcion?: string;
  }) {
    const [row] = await this.db
      .insert(schema.platoCarta)
      .values(data)
      .returning();
    return row;
  }

  async createPlatosBulk(data: {
    categoriaId: string;
    platos: Array<{ nombre: string; precio: string; descripcion?: string }>;
  }) {
    if (!data.platos?.length) {
      throw new Error('Debe proveer al menos un plato.');
    }
    const values = data.platos.map((p) => ({
      nombre: p.nombre,
      precio: p.precio,
      categoriaId: data.categoriaId,
      descripcion: p.descripcion || null,
    }));
    return this.db.insert(schema.platoCarta).values(values).returning();
  }

  async updatePlato(
    id: string,
    data: {
      nombre?: string;
      precio?: string;
      descripcion?: string;
      categoriaId?: string;
      disponible?: boolean;
      activo?: boolean;
    },
  ) {
    const [row] = await this.db
      .update(schema.platoCarta)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.platoCarta.id, id))
      .returning();
    if (!row) throw new NotFoundException('Plato no encontrado');
    return row;
  }

  // ─── Recetas ───

  async findRecetasByPlato(platoCartaId: string) {
    return this.db
      .select()
      .from(schema.recetaPlato)
      .where(eq(schema.recetaPlato.platoCartaId, platoCartaId));
  }

  async createReceta(data: {
    platoCartaId: string;
    insumoId: string;
    cantidadConsumida: number;
  }) {
    const [row] = await this.db
      .insert(schema.recetaPlato)
      .values(data)
      .returning();
    return row;
  }

  async deleteReceta(id: string) {
    const [row] = await this.db
      .delete(schema.recetaPlato)
      .where(eq(schema.recetaPlato.id, id))
      .returning();
    if (!row) throw new NotFoundException('Receta no encontrada');
    return row;
  }
}
