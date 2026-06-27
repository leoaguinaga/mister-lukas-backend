import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, and, inArray, asc, isNull, or, gte, lte } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';

export type TipoDescuento = 'porcentaje' | 'monto_fijo';

export interface UpsertPromocionInput {
  nombre: string;
  descripcion?: string | null;
  tipoDescuento: TipoDescuento;
  valorDescuento: string; // numeric as string
  diasSemana: number[]; // 1..7 (ISO: 1=lunes ... 7=domingo)
  horaInicio?: string | null; // HH:MM o HH:MM:SS
  horaFin?: string | null;
  vigenteDesde?: string | null; // YYYY-MM-DD
  vigenteHasta?: string | null;
  activo?: boolean;
  platoCartaIds: string[];
}

function normalizarDias(dias: number[]): string {
  const unique = Array.from(new Set(dias)).sort((a, b) => a - b);
  if (unique.length === 0) throw new BadRequestException('Debe seleccionar al menos un día de semana');
  for (const d of unique) {
    if (!Number.isInteger(d) || d < 1 || d > 7) {
      throw new BadRequestException('Días de semana inválidos (use 1=lunes a 7=domingo)');
    }
  }
  return unique.join(',');
}

function diasFromCsv(csv: string): number[] {
  return csv.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
}

// Convierte el día devuelto por JS (0=domingo .. 6=sábado) al estándar ISO (1=lunes .. 7=domingo).
function isoDay(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

@Injectable()
export class PromocionesService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  // ─── CRUD admin ────────────────────────────────────────────────────────────

  async list() {
    const promos = await this.db
      .select()
      .from(schema.promocion)
      .orderBy(asc(schema.promocion.createdAt));

    if (promos.length === 0) return [];

    const links = await this.db
      .select()
      .from(schema.promocionPlato)
      .where(inArray(schema.promocionPlato.promocionId, promos.map((p) => p.id)));

    return promos.map((p) => ({
      ...p,
      diasSemana: diasFromCsv(p.diasSemana),
      platoCartaIds: links.filter((l) => l.promocionId === p.id).map((l) => l.platoCartaId),
    }));
  }

  async findById(id: string) {
    const [promo] = await this.db
      .select()
      .from(schema.promocion)
      .where(eq(schema.promocion.id, id));
    if (!promo) throw new NotFoundException('Promoción no encontrada');

    const links = await this.db
      .select()
      .from(schema.promocionPlato)
      .where(eq(schema.promocionPlato.promocionId, id));

    return {
      ...promo,
      diasSemana: diasFromCsv(promo.diasSemana),
      platoCartaIds: links.map((l) => l.platoCartaId),
    };
  }

  async create(input: UpsertPromocionInput) {
    this.validar(input);
    const diasCsv = normalizarDias(input.diasSemana);

    return this.db.transaction(async (tx) => {
      const [promo] = await tx
        .insert(schema.promocion)
        .values({
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
          tipoDescuento: input.tipoDescuento,
          valorDescuento: input.valorDescuento,
          diasSemana: diasCsv,
          horaInicio: input.horaInicio ?? null,
          horaFin: input.horaFin ?? null,
          vigenteDesde: input.vigenteDesde ?? null,
          vigenteHasta: input.vigenteHasta ?? null,
          activo: input.activo ?? true,
        })
        .returning();

      if (input.platoCartaIds.length > 0) {
        await tx.insert(schema.promocionPlato).values(
          input.platoCartaIds.map((platoCartaId) => ({ promocionId: promo.id, platoCartaId })),
        );
      }

      return { ...promo, diasSemana: input.diasSemana, platoCartaIds: input.platoCartaIds };
    });
  }

  async update(id: string, input: UpsertPromocionInput) {
    this.validar(input);
    const diasCsv = normalizarDias(input.diasSemana);

    const [existing] = await this.db
      .select()
      .from(schema.promocion)
      .where(eq(schema.promocion.id, id));
    if (!existing) throw new NotFoundException('Promoción no encontrada');

    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.promocion)
        .set({
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
          tipoDescuento: input.tipoDescuento,
          valorDescuento: input.valorDescuento,
          diasSemana: diasCsv,
          horaInicio: input.horaInicio ?? null,
          horaFin: input.horaFin ?? null,
          vigenteDesde: input.vigenteDesde ?? null,
          vigenteHasta: input.vigenteHasta ?? null,
          activo: input.activo ?? existing.activo,
          updatedAt: new Date(),
        })
        .where(eq(schema.promocion.id, id))
        .returning();

      await tx.delete(schema.promocionPlato).where(eq(schema.promocionPlato.promocionId, id));
      if (input.platoCartaIds.length > 0) {
        await tx.insert(schema.promocionPlato).values(
          input.platoCartaIds.map((platoCartaId) => ({ promocionId: id, platoCartaId })),
        );
      }

      return { ...updated, diasSemana: input.diasSemana, platoCartaIds: input.platoCartaIds };
    });
  }

  async setActivo(id: string, activo: boolean) {
    const [updated] = await this.db
      .update(schema.promocion)
      .set({ activo, updatedAt: new Date() })
      .where(eq(schema.promocion.id, id))
      .returning();
    if (!updated) throw new NotFoundException('Promoción no encontrada');
    return updated;
  }

  async remove(id: string) {
    const [deleted] = await this.db
      .delete(schema.promocion)
      .where(eq(schema.promocion.id, id))
      .returning();
    if (!deleted) throw new NotFoundException('Promoción no encontrada');
    return { ok: true };
  }

  // ─── Resolución al crear pedido ────────────────────────────────────────────

  /**
   * Para cada platoCartaId devuelve la promo vigente aplicable (o null).
   * Vigente = activa, día/hora coincide, rango de vigencia cubre `ahora`.
   * Si hay varias, gana la más antigua por createdAt (regla simple y predecible).
   */
  async resolverPromocionesVigentes(
    platoCartaIds: string[],
    ahora: Date = new Date(),
  ): Promise<Map<string, typeof schema.promocion.$inferSelect>> {
    const resultado = new Map<string, typeof schema.promocion.$inferSelect>();
    if (platoCartaIds.length === 0) return resultado;

    const diaIso = isoDay(ahora);
    const hhmmss = ahora.toTimeString().slice(0, 8); // "HH:MM:SS"
    const fecha = ahora.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // Filtramos en SQL lo más posible; el día se filtra en memoria (CSV).
    const candidatas = await this.db
      .select()
      .from(schema.promocion)
      .where(
        and(
          eq(schema.promocion.activo, true),
          or(isNull(schema.promocion.vigenteDesde), lte(schema.promocion.vigenteDesde, fecha)),
          or(isNull(schema.promocion.vigenteHasta), gte(schema.promocion.vigenteHasta, fecha)),
          or(isNull(schema.promocion.horaInicio), lte(schema.promocion.horaInicio, hhmmss)),
          or(isNull(schema.promocion.horaFin), gte(schema.promocion.horaFin, hhmmss)),
        ),
      )
      .orderBy(asc(schema.promocion.createdAt));

    const aplicables = candidatas.filter((p) => diasFromCsv(p.diasSemana).includes(diaIso));
    if (aplicables.length === 0) return resultado;

    const links = await this.db
      .select()
      .from(schema.promocionPlato)
      .where(
        and(
          inArray(schema.promocionPlato.promocionId, aplicables.map((p) => p.id)),
          inArray(schema.promocionPlato.platoCartaId, platoCartaIds),
        ),
      );

    const promoMap = new Map(aplicables.map((p) => [p.id, p]));

    for (const link of links) {
      // primera promo gana (no acumulables)
      if (!resultado.has(link.platoCartaId)) {
        resultado.set(link.platoCartaId, promoMap.get(link.promocionId)!);
      }
    }

    return resultado;
  }

  /**
   * Devuelve el descuento por unidad en soles, dado el precio base y la promo.
   * Nunca supera el precio (no se permite precio negativo).
   */
  calcularDescuentoUnitario(precioUnitarioBase: number, promo: typeof schema.promocion.$inferSelect): number {
    const valor = parseFloat(promo.valorDescuento);
    let descuento = 0;
    if (promo.tipoDescuento === 'porcentaje') {
      descuento = (precioUnitarioBase * valor) / 100;
    } else {
      descuento = valor;
    }
    if (descuento < 0) descuento = 0;
    if (descuento > precioUnitarioBase) descuento = precioUnitarioBase;
    return Math.round(descuento * 100) / 100;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private validar(input: UpsertPromocionInput) {
    if (!input.nombre?.trim()) throw new BadRequestException('El nombre es obligatorio');
    const valor = parseFloat(input.valorDescuento);
    if (Number.isNaN(valor) || valor <= 0) {
      throw new BadRequestException('Valor de descuento inválido');
    }
    if (input.tipoDescuento === 'porcentaje' && valor > 100) {
      throw new BadRequestException('El porcentaje no puede superar 100');
    }
    if (input.horaInicio && input.horaFin && input.horaInicio >= input.horaFin) {
      throw new BadRequestException('Hora de inicio debe ser anterior a hora de fin');
    }
    if (input.vigenteDesde && input.vigenteHasta && input.vigenteDesde > input.vigenteHasta) {
      throw new BadRequestException('Vigencia: la fecha de inicio debe ser anterior a la de fin');
    }
  }
}
