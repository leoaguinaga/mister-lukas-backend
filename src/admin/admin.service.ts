import { Injectable, Inject, ConflictException, NotFoundException, BadRequestException, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { eq, sql, inArray, gt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import * as schema from '../db/schema';
import { auth } from '../auth/auth.config';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminService.name);
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async onApplicationBootstrap() {
    try {
      const res = await this.syncDisponible();
      this.logger.log(`Stock sync al iniciar: ${res.conStock} disponibles, ${res.sinStock} agotados`);
    } catch (err) {
      this.logger.warn(`Stock sync falló al iniciar: ${err}`);
    }
  }

  // ─── Usuarios ─────────────────────────────────────────────────────────────

  async listUsuarios() {
    return this.db
      .select({
        id:        schema.user.id,
        name:      schema.user.name,
        email:     schema.user.email,
        role:      schema.user.role,
        activo:    schema.user.activo,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .orderBy(schema.user.createdAt);
  }

  async crearUsuario(data: {
    name: string;
    email: string;
    password: string;
    role: 'mesero' | 'cajero' | 'administracion';
  }) {
    const [existing] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, data.email));
    if (existing) throw new ConflictException('El email ya está registrado');

    // Better Auth maneja el hashing de la contraseña
    const result = await auth.api.signUpEmail({
      body: { name: data.name, email: data.email, password: data.password },
      headers: new Headers(),
    });

    if (!result?.user?.id) throw new Error('Error al crear usuario');

    // Actualizar role y activo (Better Auth ignora campos extra en signUp)
    await this.db
      .update(schema.user)
      .set({ role: data.role, activo: true })
      .where(eq(schema.user.id, result.user.id));

    return { id: result.user.id, name: data.name, email: data.email, role: data.role, activo: true };
  }

  async updateUsuario(id: string, data: { activo?: boolean; role?: 'mesero' | 'cajero' | 'administracion' }) {
    const [existing] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, id));
    if (!existing) throw new NotFoundException('Usuario no encontrado');

    await this.db.update(schema.user).set(data).where(eq(schema.user.id, id));
    return { ok: true };
  }

  // ─── Stock ────────────────────────────────────────────────────────────────

  async getStock() {
    const insumos = await this.db
      .select()
      .from(schema.insumo)
      .where(eq(schema.insumo.activo, true));

    const recetas = await this.db.select().from(schema.recetaPlato);
    const platos  = await this.db.select({ id: schema.platoCarta.id, nombre: schema.platoCarta.nombre, disponible: schema.platoCarta.disponible }).from(schema.platoCarta);
    const platoMap = new Map(platos.map((p) => [p.id, p]));

    return insumos.map((ins) => {
      const platosAsociados = recetas
        .filter((r) => r.insumoId === ins.id)
        .map((r) => ({ ...platoMap.get(r.platoCartaId), cantidadConsumida: r.cantidadConsumida }))
        .filter(Boolean);
      return { ...ins, platosAsociados };
    });
  }

  async ajustarStock(
    insumoId: string,
    cantidad: number,
    notas: string,
    usuarioId: string,
  ) {
    if (!Number.isInteger(cantidad) || cantidad === 0)
      throw new BadRequestException('Cantidad debe ser un entero distinto de 0');

    const [ins] = await this.db
      .select()
      .from(schema.insumo)
      .where(eq(schema.insumo.id, insumoId));
    if (!ins) throw new NotFoundException('Insumo no encontrado');

    const [insumoActualizado] = await this.db
      .update(schema.insumo)
      .set({ stockActual: sql`${schema.insumo.stockActual} + ${cantidad}`, updatedAt: new Date() })
      .where(eq(schema.insumo.id, insumoId))
      .returning({ stockActual: schema.insumo.stockActual });

    await this.db.insert(schema.movimientoStock).values({
      insumoId,
      tipo: 'ajuste_manual',
      cantidad,
      registradoPorUsuarioId: usuarioId,
      notas: notas || `Ajuste manual: ${cantidad > 0 ? '+' : ''}${cantidad} ${ins.nombreUnidadMinima}`,
    });

    // Re-habilitar TODOS los platos vinculados si el stock pasa a positivo
    if (cantidad > 0 && (insumoActualizado?.stockActual ?? 0) > 0) {
      const afectados = await this.db
        .select({ id: schema.recetaPlato.platoCartaId })
        .from(schema.recetaPlato)
        .where(eq(schema.recetaPlato.insumoId, insumoId));
      if (afectados.length) {
        await this.db
          .update(schema.platoCarta)
          .set({ disponible: true, updatedAt: new Date() })
          .where(inArray(schema.platoCarta.id, afectados.map((r) => r.id)));
      }
    }

    return { stockActual: insumoActualizado?.stockActual ?? 0 };
  }

  // Sincroniza disponible de todos los platos A/B según stockActual del insumo
  async syncDisponible() {
    const recetas = await this.db.select().from(schema.recetaPlato);
    const insumos = await this.db.select({ id: schema.insumo.id, stockActual: schema.insumo.stockActual }).from(schema.insumo);
    const stockMap = new Map(insumos.map((i) => [i.id, i.stockActual]));

    const conStock:    string[] = [];
    const sinStock:    string[] = [];

    for (const r of recetas) {
      const stock = stockMap.get(r.insumoId) ?? 0;
      (stock > 0 ? conStock : sinStock).push(r.platoCartaId);
    }

    if (conStock.length) {
      await this.db.update(schema.platoCarta).set({ disponible: true,  updatedAt: new Date() }).where(inArray(schema.platoCarta.id, conStock));
    }
    if (sinStock.length) {
      await this.db.update(schema.platoCarta).set({ disponible: false, updatedAt: new Date() }).where(inArray(schema.platoCarta.id, sinStock));
    }

    return { sincronizados: conStock.length + sinStock.length, conStock: conStock.length, sinStock: sinStock.length };
  }
}
