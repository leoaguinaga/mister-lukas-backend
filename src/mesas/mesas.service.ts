import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/db.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

@Injectable()
export class MesasService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async findAll() {
    return this.db.select().from(schema.mesa).orderBy(schema.mesa.numero);
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(schema.mesa).where(eq(schema.mesa.id, id));
    if (!row) throw new NotFoundException('Mesa no encontrada');
    return row;
  }

  async create(data: { numero: number; capacidad?: number }) {
    const [row] = await this.db.insert(schema.mesa).values(data).returning();
    return row;
  }

  async update(
    id: string,
    data: Partial<{
      numero: number;
      capacidad: number;
      estado: 'libre' | 'ocupada';
      filaPosicion: number | null;
      colPosicion: number | null;
    }>,
  ) {
    const [row] = await this.db
      .update(schema.mesa)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.mesa.id, id))
      .returning();
    if (!row) throw new NotFoundException('Mesa no encontrada');
    return row;
  }

  async actualizarLayout(
    posiciones: Array<{ id: string; filaPosicion: number | null; colPosicion: number | null }>,
  ) {
    for (const p of posiciones) {
      await this.db
        .update(schema.mesa)
        .set({ filaPosicion: p.filaPosicion, colPosicion: p.colPosicion, updatedAt: new Date() })
        .where(eq(schema.mesa.id, p.id));
    }
    return { ok: true, actualizadas: posiciones.length };
  }

  async delete(id: string) {
    const [row] = await this.db.delete(schema.mesa).where(eq(schema.mesa.id, id)).returning();
    if (!row) throw new NotFoundException('Mesa no encontrada');
    return row;
  }
}
