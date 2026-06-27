import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, inArray, notInArray, gte, desc } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import { PRINT_SERVICE } from '../print/print.interface';
import type { PrintService } from '../print/print.interface';
import * as schema from '../db/schema';

type MetodoPago = 'efectivo' | 'tarjeta' | 'yape_plin' | 'transferencia';

@Injectable()
export class CajaService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(PRINT_SERVICE) private printer: PrintService,
  ) {}

  // ─── Turno activo ─────────────────────────────────────────────────────────

  async getTurnoActivo(cajeroId: string) {
    const [turno] = await this.db
      .select()
      .from(schema.turnoCaja)
      .where(
        and(
          eq(schema.turnoCaja.cajeroUsuarioId, cajeroId),
          eq(schema.turnoCaja.estado, 'abierto'),
        ),
      );
    return turno ?? null;
  }

  async getTurnoConPagos(cajeroId: string) {
    const turno = await this.getTurnoActivo(cajeroId);
    if (!turno) return null;

    // Join pago → visitaMesa → mesa para obtener el número de mesa
    const pagos = await this.db
      .select({
        id: schema.pago.id,
        visitaMesaId: schema.pago.visitaMesaId,
        metodoPago: schema.pago.metodoPago,
        montoTotal: schema.pago.montoTotal,
        fechaPago: schema.pago.fechaPago,
        mesaNumero: schema.mesa.numero,
      })
      .from(schema.pago)
      .leftJoin(schema.visitaMesa, eq(schema.pago.visitaMesaId, schema.visitaMesa.id))
      .leftJoin(schema.mesa, eq(schema.visitaMesa.mesaId, schema.mesa.id))
      .where(eq(schema.pago.turnoCajaId, turno.id))
      .orderBy(schema.pago.fechaPago);

    // Totales por canal de pago
    const porCanal = { efectivo: 0, tarjeta: 0, yape_plin: 0, transferencia: 0 };
    for (const p of pagos) {
      const m = p.metodoPago as MetodoPago;
      if (m in porCanal) porCanal[m] += parseFloat(p.montoTotal);
    }

    const totalEfectivo = porCanal.efectivo;
    const totalTurno = Object.values(porCanal).reduce((s, v) => s + v, 0);

    return {
      ...turno,
      pagos,
      porCanal: {
        efectivo:      porCanal.efectivo.toFixed(2),
        tarjeta:       porCanal.tarjeta.toFixed(2),
        yape_plin:     porCanal.yape_plin.toFixed(2),
        transferencia: porCanal.transferencia.toFixed(2),
      },
      totalEfectivo:     totalEfectivo.toFixed(2),
      totalTurno:        totalTurno.toFixed(2),
      montoCierreTeorico: (parseFloat(turno.montoApertura) + totalEfectivo).toFixed(2),
    };
  }

  // ─── Abrir turno ──────────────────────────────────────────────────────────

  async abrirTurno(cajeroId: string, montoApertura: number) {
    const turnoExistente = await this.getTurnoActivo(cajeroId);
    if (turnoExistente) {
      throw new ConflictException('Ya hay un turno abierto para este cajero');
    }

    const [turno] = await this.db
      .insert(schema.turnoCaja)
      .values({ cajeroUsuarioId: cajeroId, montoApertura: montoApertura.toFixed(2) })
      .returning();

    return turno;
  }

  // ─── Mesas listas para cobrar ─────────────────────────────────────────────

  async getMesasParaCobrar() {
    const visitasAbiertas = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.estado, 'abierta'));

    if (!visitasAbiertas.length) return [];

    const visitaIds = visitasAbiertas.map((v) => v.id);

    // Solo pedidos no cancelados
    const pedidos = await this.db
      .select()
      .from(schema.pedido)
      .where(
        and(
          inArray(schema.pedido.visitaMesaId, visitaIds),
          notInArray(schema.pedido.estado, ['cancelado']),
        ),
      );

    const items = pedidos.length
      ? await this.db
          .select()
          .from(schema.itemPedido)
          .where(inArray(schema.itemPedido.pedidoId, pedidos.map((p) => p.id)))
      : [];

    const mesas = await this.db.select().from(schema.mesa);
    const mesaMap = new Map(mesas.map((m) => [m.id, m]));

    // Visitas que ya tienen pago → no mostrar de nuevo
    const pagosExistentes = await this.db
      .select()
      .from(schema.pago)
      .where(inArray(schema.pago.visitaMesaId, visitaIds));
    const visitasYaCobradas = new Set(pagosExistentes.map((p) => p.visitaMesaId));

    return visitasAbiertas
      .filter((v) => !visitasYaCobradas.has(v.id))
      .map((visita) => {
        const pedidosVisita = pedidos.filter((p) => p.visitaMesaId === visita.id);
        const itemsVisita = items.filter((i) =>
          pedidosVisita.some((p) => p.id === i.pedidoId),
        );
        const total = itemsVisita.reduce(
          (s, i) => s + parseFloat(i.precioUnitarioCongelado) * i.cantidad,
          0,
        );
        const mesa = mesaMap.get(visita.mesaId);
        return {
          visitaId: visita.id,
          mesaId: visita.mesaId,
          mesaNumero: mesa?.numero ?? 0,
          paraLlevar: visita.paraLlevar,
          fechaApertura: visita.fechaApertura,
          total: total.toFixed(2),
          pedidos: pedidosVisita.length,
        };
      })
      .sort((a, b) => a.mesaNumero - b.mesaNumero);
  }

  // ─── Detalle de visita para cobrar ────────────────────────────────────────

  async getDetalleVisita(visitaId: string) {
    const [visita] = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.id, visitaId));

    if (!visita) throw new NotFoundException('Visita no encontrada');

    // Todos los pedidos no cancelados (incluyendo pendientes y en preparación)
    const pedidos = await this.db
      .select()
      .from(schema.pedido)
      .where(
        and(
          eq(schema.pedido.visitaMesaId, visitaId),
          notInArray(schema.pedido.estado, ['cancelado']),
        ),
      );

    const items = pedidos.length
      ? await this.db
          .select()
          .from(schema.itemPedido)
          .where(inArray(schema.itemPedido.pedidoId, pedidos.map((p) => p.id)))
      : [];

    const platos = items.length
      ? await this.db
          .select()
          .from(schema.platoCarta)
          .where(inArray(schema.platoCarta.id, items.map((i) => i.platoCartaId)))
      : [];

    const platoMap = new Map(platos.map((p) => [p.id, p]));

    const [mesa] = await this.db
      .select()
      .from(schema.mesa)
      .where(eq(schema.mesa.id, visita.mesaId));

    const total = items.reduce(
      (s, i) => s + parseFloat(i.precioUnitarioCongelado) * i.cantidad,
      0,
    );

    const descuentoTotal = items.reduce(
      (s, i) => s + parseFloat(i.descuentoUnitario ?? '0') * i.cantidad,
      0,
    );

    // Agrupar items por plato (mismo plato + mismo descuento se considera misma línea)
    const resumen = new Map<string, { nombre: string; cantidad: number; precioUnitario: string; descuentoUnitario: string }>();
    for (const item of items) {
      const plato = platoMap.get(item.platoCartaId);
      const key = `${item.platoCartaId}::${item.descuentoUnitario}`;
      if (resumen.has(key)) {
        resumen.get(key)!.cantidad += item.cantidad;
      } else {
        resumen.set(key, {
          nombre: plato?.nombre ?? item.platoCartaId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitarioCongelado,
          descuentoUnitario: item.descuentoUnitario ?? '0.00',
        });
      }
    }

    return {
      visitaId,
      mesaNumero: mesa?.numero ?? 0,
      fechaApertura: visita.fechaApertura,
      resumen: Array.from(resumen.values()),
      total: total.toFixed(2),
      descuentoTotal: descuentoTotal.toFixed(2),
    };
  }

  // ─── Registrar pago (acepta múltiples métodos de pago) ────────────────────

  async registrarPago(
    cajeroId: string,
    visitaId: string,
    pagos: Array<{ metodoPago: MetodoPago; monto: number }>,
  ) {
    const turno = await this.getTurnoActivo(cajeroId);
    if (!turno) throw new BadRequestException('No hay turno de caja abierto');

    if (!pagos.length) throw new BadRequestException('Debe incluir al menos un método de pago');

    // Verificar que no se haya cobrado ya
    const [pagoExistente] = await this.db
      .select()
      .from(schema.pago)
      .where(eq(schema.pago.visitaMesaId, visitaId));
    if (pagoExistente) throw new ConflictException('Esta visita ya fue cobrada');

    const detalle = await this.getDetalleVisita(visitaId);
    const totalEsperado = parseFloat(detalle.total);
    const totalRecibido = pagos.reduce((s, p) => s + p.monto, 0);

    if (Math.abs(totalRecibido - totalEsperado) > 0.01) {
      throw new BadRequestException(
        `La suma de pagos (S/${totalRecibido.toFixed(2)}) no coincide con el total de la visita (S/${detalle.total})`,
      );
    }

    // Insertar todos los pagos
    const nuevosPagos = await this.db
      .insert(schema.pago)
      .values(
        pagos.map((p) => ({
          turnoCajaId: turno.id,
          visitaMesaId: visitaId,
          registradoPorUsuarioId: cajeroId,
          metodoPago: p.metodoPago,
          montoTotal: p.monto.toFixed(2),
        })),
      )
      .returning();

    // Cerrar visita y liberar mesa
    await this.db
      .update(schema.visitaMesa)
      .set({ estado: 'cerrada', fechaCierre: new Date() })
      .where(eq(schema.visitaMesa.id, visitaId));

    const [visita] = await this.db
      .select()
      .from(schema.visitaMesa)
      .where(eq(schema.visitaMesa.id, visitaId));

    if (visita) {
      await this.db
        .update(schema.mesa)
        .set({ estado: 'libre', updatedAt: new Date() })
        .where(eq(schema.mesa.id, visita.mesaId));
    }

    // Imprimir recibo (no bloqueante)
    const metodosLabel = pagos
      .map((p) => p.metodoPago.replace('_', '/'))
      .join(' + ');
    this.printer.printReceipt({
      visitaId,
      mesaNumero: detalle.mesaNumero,
      items: detalle.resumen,
      total: detalle.total,
      metodoPago: metodosLabel,
      fechaPago: new Date(),
    }).catch(() => {});

    return nuevosPagos;
  }

  // ─── Historial de turnos del día (para admin) ────────────────────────────

  async getTurnosHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const filas = await this.db
      .select({
        turno: schema.turnoCaja,
        cajeroNombre: schema.user.name,
      })
      .from(schema.turnoCaja)
      .leftJoin(schema.user, eq(schema.turnoCaja.cajeroUsuarioId, schema.user.id))
      .where(gte(schema.turnoCaja.fechaApertura, hoy))
      .orderBy(desc(schema.turnoCaja.fechaApertura));

    if (!filas.length) return [];

    const turnoIds = filas.map((f) => f.turno.id);
    const pagos = await this.db
      .select()
      .from(schema.pago)
      .where(inArray(schema.pago.turnoCajaId, turnoIds));

    return filas.map(({ turno, cajeroNombre }) => {
      const pagosTurno = pagos.filter((p) => p.turnoCajaId === turno.id);
      const porCanal = { efectivo: 0, tarjeta: 0, yape_plin: 0, transferencia: 0 };
      for (const p of pagosTurno) {
        const m = p.metodoPago as keyof typeof porCanal;
        if (m in porCanal) porCanal[m] += parseFloat(p.montoTotal);
      }
      const totalTurno = Object.values(porCanal).reduce((s, v) => s + v, 0);
      return {
        ...turno,
        cajeroNombre: cajeroNombre ?? 'Desconocido',
        porCanal: {
          efectivo:      porCanal.efectivo.toFixed(2),
          tarjeta:       porCanal.tarjeta.toFixed(2),
          yape_plin:     porCanal.yape_plin.toFixed(2),
          transferencia: porCanal.transferencia.toFixed(2),
        },
        totalTurno: totalTurno.toFixed(2),
        cobros: pagosTurno.length,
      };
    });
  }

  // ─── Cerrar turno ─────────────────────────────────────────────────────────

  async cerrarTurno(cajeroId: string, montoCierreReal: number) {
    const turno = await this.getTurnoActivo(cajeroId);
    if (!turno) throw new NotFoundException('No hay turno abierto');

    const pagos = await this.db
      .select()
      .from(schema.pago)
      .where(eq(schema.pago.turnoCajaId, turno.id));

    const totalEfectivo = pagos
      .filter((p) => p.metodoPago === 'efectivo')
      .reduce((s, p) => s + parseFloat(p.montoTotal), 0);

    const montoCierreTeorico = parseFloat(turno.montoApertura) + totalEfectivo;
    const diferencia = montoCierreReal - montoCierreTeorico;

    const [turnoCerrado] = await this.db
      .update(schema.turnoCaja)
      .set({
        estado: 'cerrado',
        montoCierreTeorico: montoCierreTeorico.toFixed(2),
        montoCierreReal: montoCierreReal.toFixed(2),
        diferencia: diferencia.toFixed(2),
        fechaCierre: new Date(),
      })
      .where(eq(schema.turnoCaja.id, turno.id))
      .returning();

    return turnoCerrado;
  }
}
