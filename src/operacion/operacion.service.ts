import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import { PRINT_SERVICE } from '../print/print.interface';
import type { PrintService } from '../print/print.interface';
import * as schema from '../db/schema';

@Injectable()
export class OperacionService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(PRINT_SERVICE) private printer: PrintService,
  ) {}

  // ─── Monitor: rondas pendientes de todas las mesas ───────────────────────

  async getMonitor() {
    // Visitas abiertas
    const visitas = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.estado, 'abierta'));

    if (visitas.length === 0) return [];

    const visitaIds = visitas.map((v) => v.id);

    // Pedidos pendientes o en preparación dentro de visitas abiertas
    const pedidos = await this.db
      .select()
      .from(schema.pedido)
      .where(
        and(
          inArray(schema.pedido.visitaMesaId, visitaIds),
          inArray(schema.pedido.estado, ['pendiente', 'en_preparacion', 'listo']),
        ),
      );

    if (pedidos.length === 0) return [];

    const pedidoIds = pedidos.map((p) => p.id);
    const items = await this.db
      .select()
      .from(schema.itemPedido)
      .where(inArray(schema.itemPedido.pedidoId, pedidoIds));

    const mesas = await this.db.select().from(schema.mesa);
    const mesaMap = new Map(mesas.map((m) => [m.id, m]));
    const visitaMap = new Map(visitas.map((v) => [v.id, v]));

    return pedidos.map((p) => {
      const visita = visitaMap.get(p.visitaMesaId)!;
      const mesa = mesaMap.get(visita.mesaId);
      const minutosEspera = Math.floor(
        (Date.now() - new Date(p.fechaCreacion).getTime()) / 60000,
      );
      return {
        pedidoId: p.id,
        visitaId: p.visitaMesaId,
        mesaNumero: mesa?.numero ?? 0,
        estado: p.estado,
        fechaCreacion: p.fechaCreacion,
        minutosEspera,
        items: items
          .filter((i) => i.pedidoId === p.id)
          .map((i) => ({ platoCartaId: i.platoCartaId, cantidad: i.cantidad, notas: i.notas })),
      };
    });
  }

  // ─── Visita activa de una mesa ────────────────────────────────────────────

  async getVisitaActivaPorMesa(mesaId: string) {
    const [visita] = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(
        and(
          eq(schema.visitaMesa.mesaId, mesaId),
          eq(schema.visitaMesa.estado, 'abierta'),
        ),
      );
    if (!visita) throw new NotFoundException('No hay visita activa en esta mesa');
    return visita;
  }

  // ─── Pedido para llevar ───────────────────────────────────────────────────

  async abrirVisitaParaLlevar(usuarioId: string) {
    // Busca o crea una mesa virtual numero=0 reservada para llevar
    let [mesaLlevar] = await this.db
      .select()
      .from(schema.mesa)
      .where(eq(schema.mesa.numero, 0));

    if (!mesaLlevar) {
      [mesaLlevar] = await this.db
        .insert(schema.mesa)
        .values({ numero: 0, capacidad: null })
        .returning();
    }

    // Crea la visita con paraLlevar=true sin tocar el estado de la mesa
    const [visita] = await this.db
      .insert(schema.visitaMesa)
      .values({ mesaId: mesaLlevar.id, abiertaPorUsuarioId: usuarioId, paraLlevar: true })
      .returning();

    return visita;
  }

  // ─── Abrir mesa ───────────────────────────────────────────────────────────

  async abrirMesa(mesaId: string, usuarioId: string) {
    const [mesa] = await this.db
      .select()
      .from(schema.mesa)
      .where(eq(schema.mesa.id, mesaId));

    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    if (mesa.estado === 'ocupada')
      throw new BadRequestException(`Mesa ${mesa.numero} ya está ocupada`);

    // Abrir visita + marcar mesa en una transacción
    return this.db.transaction(async (tx) => {
      const [visita] = await tx
        .insert(schema.visitaMesa)
        .values({ mesaId, abiertaPorUsuarioId: usuarioId })
        .returning();

      await tx
        .update(schema.mesa)
        .set({ estado: 'ocupada', updatedAt: new Date() })
        .where(eq(schema.mesa.id, mesaId));

      return visita;
    });
  }

  // ─── Detalle de visita ────────────────────────────────────────────────────

  async getVisita(visitaId: string) {
    const [visita] = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.id, visitaId));

    if (!visita) throw new NotFoundException('Visita no encontrada');

    const pedidos = await this.db
      .select()
      .from(schema.pedido)
      .where(eq(schema.pedido.visitaMesaId, visitaId));

    const pedidoIds = pedidos.map((p) => p.id);
    const items =
      pedidoIds.length > 0
        ? await this.db
            .select()
            .from(schema.itemPedido)
            .where(inArray(schema.itemPedido.pedidoId, pedidoIds))
        : [];

    const pedidosConItems = pedidos.map((p) => ({
      ...p,
      items: items.filter((i) => i.pedidoId === p.id),
    }));

    const total = items.reduce(
      (sum, i) => sum + parseFloat(i.precioUnitarioCongelado) * i.cantidad,
      0,
    );

    return { ...visita, pedidos: pedidosConItems, total: total.toFixed(2) };
  }

  // ─── Crear pedido (ronda) ─────────────────────────────────────────────────

  async crearPedido(
    visitaId: string,
    usuarioId: string,
    items: Array<{ platoCartaId: string; cantidad: number; notas?: string }>,
  ) {
    const [visita] = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.id, visitaId));

    if (!visita) throw new NotFoundException('Visita no encontrada');
    if (visita.estado === 'cerrada')
      throw new BadRequestException('La visita ya está cerrada');

    // Verificar platos y obtener precios actuales
    const platoIds = items.map((i) => i.platoCartaId);
    const platos = await this.db
      .select()
      .from(schema.platoCarta)
      .where(inArray(schema.platoCarta.id, platoIds));

    const platoMap = new Map(platos.map((p) => [p.id, p]));

    for (const item of items) {
      const plato = platoMap.get(item.platoCartaId);
      if (!plato) throw new NotFoundException(`Plato ${item.platoCartaId} no encontrado`);
      if (!plato.disponible) throw new BadRequestException(`"${plato.nombre}" no está disponible`);
    }

    // Obtener datos de mesa y mesero para el ticket
    const [mesa] = await this.db
      .select()
      .from(schema.mesa)
      .where(eq(schema.mesa.id, visita.mesaId));

    const [mesero] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, usuarioId));

    const resultado = await this.db.transaction(async (tx) => {
      const [pedido] = await tx
        .insert(schema.pedido)
        .values({ visitaMesaId: visitaId, tomadoPorUsuarioId: usuarioId })
        .returning();

      const itemsInsert = items.map((i) => {
        const plato = platoMap.get(i.platoCartaId)!;
        const precioBase = parseFloat(plato.precio);
        // +S/1 por plato en pedidos para llevar, excepto bebidas (reventa)
        const recargo = visita.paraLlevar && plato.categoriaInventario !== 'reventa' ? 1 : 0;
        return {
          pedidoId: pedido.id,
          platoCartaId: i.platoCartaId,
          cantidad: i.cantidad,
          precioUnitarioCongelado: (precioBase + recargo).toFixed(2),
          notas: i.notas,
        };
      });

      const itemsCreados = await tx
        .insert(schema.itemPedido)
        .values(itemsInsert)
        .returning();

      // Descontar stock para platos A (fraccionable) y B (reventa)
      for (const itemCreado of itemsCreados) {
        const plato = platoMap.get(itemCreado.platoCartaId)!;
        if (plato.categoriaInventario === 'multi_insumo') continue;

        const [receta] = await tx
          .select()
          .from(schema.recetaPlato)
          .where(eq(schema.recetaPlato.platoCartaId, plato.id));
        if (!receta) continue;

        const consumido = receta.cantidadConsumida * itemCreado.cantidad;

        const [insumoActualizado] = await tx
          .update(schema.insumo)
          .set({ stockActual: sql`${schema.insumo.stockActual} - ${consumido}`, updatedAt: new Date() })
          .where(eq(schema.insumo.id, receta.insumoId))
          .returning({ id: schema.insumo.id, stockActual: schema.insumo.stockActual });

        await tx.insert(schema.movimientoStock).values({
          insumoId: receta.insumoId,
          tipo: 'venta',
          cantidad: -consumido,
          itemPedidoId: itemCreado.id,
          registradoPorUsuarioId: usuarioId,
        });

        // Auto-marcar sin disponible si el insumo llega a 0
        if ((insumoActualizado?.stockActual ?? 0) <= 0) {
          const afectados = await tx
            .select({ id: schema.recetaPlato.platoCartaId })
            .from(schema.recetaPlato)
            .where(eq(schema.recetaPlato.insumoId, receta.insumoId));
          if (afectados.length) {
            await tx
              .update(schema.platoCarta)
              .set({ disponible: false, updatedAt: new Date() })
              .where(inArray(schema.platoCarta.id, afectados.map((r) => r.id)));
          }
        }
      }

      return { ...pedido, items: itemsCreados };
    });

    // Imprimir comanda (no bloquea si falla)
    this.printer.printKitchenTicket({
      pedidoId: resultado.id,
      visitaId,
      mesaNumero: mesa?.numero ?? 0,
      mesero: mesero?.name ?? usuarioId,
      items: resultado.items.map((i) => ({
        nombre: platoMap.get(i.platoCartaId)!.nombre,
        cantidad: i.cantidad,
        notas: i.notas,
      })),
      fechaCreacion: resultado.fechaCreacion,
    }).catch(() => {/* fallo de impresión no interrumpe la operación */});

    return resultado;
  }

  // ─── Cambiar estado de pedido ─────────────────────────────────────────────

  async cambiarEstadoPedido(
    pedidoId: string,
    nuevoEstado: 'en_preparacion' | 'listo' | 'entregado' | 'cancelado',
  ) {
    const [pedido] = await this.db
      .select()
      .from(schema.pedido)
      .where(eq(schema.pedido.id, pedidoId));

    if (!pedido) throw new NotFoundException('Pedido no encontrado');

    const TRANSICIONES: Record<string, string[]> = {
      pendiente:      ['en_preparacion', 'listo', 'entregado', 'cancelado'],
      en_preparacion: ['listo', 'entregado', 'cancelado'],
      listo:          ['entregado', 'cancelado'],
      entregado:      [],
      cancelado:      [],
    };

    if (!TRANSICIONES[pedido.estado]?.includes(nuevoEstado)) {
      throw new BadRequestException(
        `No se puede pasar de "${pedido.estado}" a "${nuevoEstado}"`,
      );
    }

    const timestamps: Partial<typeof schema.pedido.$inferInsert> = {};
    if (nuevoEstado === 'listo') timestamps.fechaListo = new Date();
    if (nuevoEstado === 'entregado') timestamps.fechaEntregado = new Date();

    const [updated] = await this.db
      .update(schema.pedido)
      .set({ estado: nuevoEstado, ...timestamps })
      .where(eq(schema.pedido.id, pedidoId))
      .returning();

    // Restaurar stock si se cancela
    if (nuevoEstado === 'cancelado') {
      const itemsCancelados = await this.db
        .select()
        .from(schema.itemPedido)
        .where(eq(schema.itemPedido.pedidoId, pedidoId));

      for (const item of itemsCancelados) {
        const [plato] = await this.db
          .select()
          .from(schema.platoCarta)
          .where(eq(schema.platoCarta.id, item.platoCartaId));
        if (!plato || plato.categoriaInventario === 'multi_insumo') continue;

        const [receta] = await this.db
          .select()
          .from(schema.recetaPlato)
          .where(eq(schema.recetaPlato.platoCartaId, item.platoCartaId));
        if (!receta) continue;

        const restaurado = receta.cantidadConsumida * item.cantidad;

        const [insumoActualizado] = await this.db
          .update(schema.insumo)
          .set({ stockActual: sql`${schema.insumo.stockActual} + ${restaurado}`, updatedAt: new Date() })
          .where(eq(schema.insumo.id, receta.insumoId))
          .returning({ stockActual: schema.insumo.stockActual });

        await this.db.insert(schema.movimientoStock).values({
          insumoId: receta.insumoId,
          tipo: 'ajuste_manual',
          cantidad: restaurado,
          itemPedidoId: item.id,
          notas: 'Pedido cancelado — stock restaurado',
        });

        // Re-habilitar platos si el insumo volvió a tener stock
        if ((insumoActualizado?.stockActual ?? 0) > 0) {
          const afectados = await this.db
            .select({ id: schema.recetaPlato.platoCartaId })
            .from(schema.recetaPlato)
            .where(eq(schema.recetaPlato.insumoId, receta.insumoId));
          if (afectados.length) {
            await this.db
              .update(schema.platoCarta)
              .set({ disponible: true, updatedAt: new Date() })
              .where(inArray(schema.platoCarta.id, afectados.map((r) => r.id)));
          }
        }
      }
    }

    return updated;
  }

  // ─── Cerrar visita ────────────────────────────────────────────────────────

  async cerrarVisita(visitaId: string) {
    const [visita] = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.id, visitaId));

    if (!visita) throw new NotFoundException('Visita no encontrada');
    if (visita.estado === 'cerrada')
      throw new BadRequestException('La visita ya está cerrada');

    // Verificar que no haya pedidos pendientes o en preparación
    const pedidosActivos = await this.db
      .select()
      .from(schema.pedido)
      .where(
        and(
          eq(schema.pedido.visitaMesaId, visitaId),
          inArray(schema.pedido.estado, ['pendiente', 'en_preparacion']),
        ),
      );

    if (pedidosActivos.length > 0) {
      throw new BadRequestException(
        `Hay ${pedidosActivos.length} pedido(s) pendiente(s) de entregar`,
      );
    }

    return this.db.transaction(async (tx) => {
      const [visitaCerrada] = await tx
        .update(schema.visitaMesa)
        .set({ estado: 'cerrada', fechaCierre: new Date() })
        .where(eq(schema.visitaMesa.id, visitaId))
        .returning();

      // La mesa virtual (para llevar, numero=0) siempre queda libre; no cambiar estado
      if (!visita.paraLlevar) {
        await tx
          .update(schema.mesa)
          .set({ estado: 'libre', updatedAt: new Date() })
          .where(eq(schema.mesa.id, visita.mesaId));
      }

      return visitaCerrada;
    });
  }
}
