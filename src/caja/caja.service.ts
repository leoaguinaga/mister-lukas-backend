import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and, inArray, notInArray, gte, desc, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/db.module';
import { PRINT_SERVICE } from '../print/print.interface';
import type { PrintService } from '../print/print.interface';
import { PromocionesService } from '../promociones/promociones.service';
import * as schema from '../db/schema';

type MetodoPago = 'efectivo' | 'tarjeta' | 'yape_plin' | 'transferencia';

@Injectable()
export class CajaService {
  private readonly logger = new Logger(CajaService.name);
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(PRINT_SERVICE) private printer: PrintService,
    private readonly promociones: PromocionesService,
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

    const gastos = await this.db
      .select()
      .from(schema.gasto)
      .where(eq(schema.gasto.turnoCajaId, turno.id))
      .orderBy(schema.gasto.createdAt);

    // Totales por canal de pago
    const porCanal = { efectivo: 0, tarjeta: 0, yape_plin: 0, transferencia: 0 };
    for (const p of pagos) {
      const m = p.metodoPago as MetodoPago;
      if (m in porCanal) porCanal[m] += parseFloat(p.montoTotal);
    }

    const totalEfectivo = porCanal.efectivo;
    const totalTurno = Object.values(porCanal).reduce((s, v) => s + v, 0);
    const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.monto), 0);

    return {
      ...turno,
      pagos,
      gastos,
      porCanal: {
        efectivo:      porCanal.efectivo.toFixed(2),
        tarjeta:       porCanal.tarjeta.toFixed(2),
        yape_plin:     porCanal.yape_plin.toFixed(2),
        transferencia: porCanal.transferencia.toFixed(2),
      },
      totalEfectivo:     totalEfectivo.toFixed(2),
      totalTurno:        totalTurno.toFixed(2),
      totalGastos:       totalGastos.toFixed(2),
      montoCierreTeorico: (parseFloat(turno.montoApertura) + totalEfectivo - totalGastos).toFixed(2),
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

  async registrarGasto(cajeroId: string, data: { monto: number; motivo: string }) {
    const turno = await this.getTurnoActivo(cajeroId);
    if (!turno) {
      throw new BadRequestException('No hay turno de caja abierto');
    }

    const [nuevoGasto] = await this.db
      .insert(schema.gasto)
      .values({
        turnoCajaId: turno.id,
        cajeroUsuarioId: cajeroId,
        monto: data.monto.toFixed(2),
        motivo: data.motivo.trim(),
      })
      .returning();

    return nuevoGasto;
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
        const totalItems = itemsVisita.reduce(
          (s, i) => s + parseFloat(i.precioUnitarioCongelado) * i.cantidad,
          0,
        );
        const costoEnvioVal = (visita.tipo === 'delivery' && visita.costoEnvio)
          ? parseFloat(visita.costoEnvio)
          : 0;
        const total = totalItems + costoEnvioVal;

        const mesa = visita.mesaId ? mesaMap.get(visita.mesaId) : null;
        return {
          visitaId: visita.id,
          mesaId: visita.mesaId,
          mesaNumero: mesa?.numero ?? null,
          tipo: visita.tipo,
          nombreCliente: visita.nombreCliente,
          telefonoCliente: visita.telefonoCliente,
          direccionDelivery: visita.direccionDelivery,
          costoEnvio: visita.costoEnvio,
          paraLlevar: visita.paraLlevar,
          fechaApertura: visita.fechaApertura,
          total: total.toFixed(2),
          pedidos: pedidosVisita.length,
        };
      })
      .sort((a, b) => {
        if (a.mesaNumero !== null && b.mesaNumero !== null) {
          return a.mesaNumero - b.mesaNumero;
        }
        if (a.mesaNumero !== null) return -1;
        if (b.mesaNumero !== null) return 1;
        return new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime();
      });
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
          .where(
            and(
              inArray(schema.itemPedido.pedidoId, pedidos.map((p) => p.id)),
              notInArray(schema.itemPedido.estado, ['cancelado']),
            ),
          )
      : [];

    const platos = items.length
      ? await this.db
          .select()
          .from(schema.platoCarta)
          .where(inArray(schema.platoCarta.id, items.map((i) => i.platoCartaId)))
      : [];

    const platoMap = new Map(platos.map((p) => [p.id, p]));

    const [mesa] = visita.mesaId
      ? await this.db
          .select()
          .from(schema.mesa)
          .where(eq(schema.mesa.id, visita.mesaId))
      : [null];

    const totalItems = items.reduce(
      (s, i) => s + parseFloat(i.precioUnitarioCongelado) * i.cantidad,
      0,
    );

    const costoEnvioVal = (visita.tipo === 'delivery' && visita.costoEnvio)
      ? parseFloat(visita.costoEnvio)
      : 0;
    const total = totalItems + costoEnvioVal;

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
      mesaNumero: mesa?.numero ?? null,
      tipo: visita.tipo,
      nombreCliente: visita.nombreCliente,
      telefonoCliente: visita.telefonoCliente,
      direccionDelivery: visita.direccionDelivery,
      costoEnvio: visita.costoEnvio,
      fechaApertura: visita.fechaApertura,
      resumen: Array.from(resumen.values()),
      total: total.toFixed(2),
      descuentoTotal: descuentoTotal.toFixed(2),
    };
  }

  // ─── Imprimir precuenta (resumen sin cobrar) ─────────────────────────────
  // El cajero puede llamar este endpoint las veces que necesite antes del
  // pago; no marca la visita como cobrada ni hace nada en la BD.

  async imprimirPrecuenta(visitaId: string) {
    const detalle = await this.getDetalleVisita(visitaId);

    const [pagoExistente] = await this.db
      .select()
      .from(schema.pago)
      .where(eq(schema.pago.visitaMesaId, visitaId));
    if (pagoExistente) {
      throw new BadRequestException('Esta visita ya fue cobrada — no se emite precuenta');
    }

    await this.printer.printReceipt({
      visitaId,
      mesaNumero: detalle.mesaNumero ?? 0,
      tipoVisita: detalle.tipo,
      nombreCliente: detalle.nombreCliente ?? undefined,
      telefonoCliente: detalle.telefonoCliente ?? undefined,
      direccionDelivery: detalle.direccionDelivery ?? undefined,
      costoEnvio: detalle.costoEnvio ?? undefined,
      items: detalle.resumen,
      total: detalle.total,
      descuentoTotal: detalle.descuentoTotal,
      esPrecuenta: true,
      metodoPago: '',
      fechaPago: new Date(),
    }).catch((err) => {
      this.logger.error(`Error al imprimir precuenta: ${err.message}`, err.stack);
    });

    return { ok: true, total: detalle.total };
  }

  // ─── Registrar pago (acepta múltiples métodos de pago + ajuste opcional) ──

  async registrarPago(
    cajeroId: string,
    visitaId: string,
    pagos: Array<{ metodoPago: MetodoPago; monto: number }>,
    ajuste?: { motivo: string; monto: number },
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
    const totalItems = parseFloat(detalle.total);

    // Validar ajuste si se proporcionó
    let ajusteMonto = 0;
    let motivoAjuste: string | null = null;
    if (ajuste && Math.abs(ajuste.monto) > 0.005) {
      ajusteMonto = ajuste.monto;
      motivoAjuste = (ajuste.motivo ?? '').trim();
      if (!motivoAjuste) {
        throw new BadRequestException('El ajuste manual requiere un motivo');
      }
    }

    const totalEsperado = totalItems + ajusteMonto;
    if (totalEsperado < 0) {
      throw new BadRequestException('El ajuste no puede dejar el total en negativo');
    }

    const totalRecibido = pagos.reduce((s, p) => s + p.monto, 0);
    if (Math.abs(totalRecibido - totalEsperado) > 0.01) {
      throw new BadRequestException(
        `La suma de pagos (S/${totalRecibido.toFixed(2)}) no coincide con el total a cobrar (S/${totalEsperado.toFixed(2)})`,
      );
    }

    // Insertar todos los pagos. El ajuste solo va en la primera fila para
    // tener un registro único auditable de la decisión del cajero.
    const nuevosPagos = await this.db
      .insert(schema.pago)
      .values(
        pagos.map((p, idx) => ({
          turnoCajaId: turno.id,
          visitaMesaId: visitaId,
          registradoPorUsuarioId: cajeroId,
          metodoPago: p.metodoPago,
          montoTotal: p.monto.toFixed(2),
          ajusteMonto: idx === 0 && ajusteMonto !== 0 ? ajusteMonto.toFixed(2) : null,
          motivoAjuste: idx === 0 ? motivoAjuste : null,
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

    if (visita && visita.mesaId) {
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
      mesaNumero: detalle.mesaNumero ?? 0,
      tipoVisita: detalle.tipo,
      nombreCliente: detalle.nombreCliente ?? undefined,
      telefonoCliente: detalle.telefonoCliente ?? undefined,
      direccionDelivery: detalle.direccionDelivery ?? undefined,
      costoEnvio: detalle.costoEnvio ?? undefined,
      items: detalle.resumen,
      total: detalle.total,
      descuentoTotal: detalle.descuentoTotal,
      ajusteMonto: ajusteMonto !== 0 ? ajusteMonto.toFixed(2) : undefined,
      motivoAjuste: motivoAjuste ?? undefined,
      metodoPago: metodosLabel,
      fechaPago: new Date(),
    }).catch((err) => {
      this.logger.error(`Error al imprimir recibo: ${err.message}`, err.stack);
    });

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

    const gastos = await this.db
      .select()
      .from(schema.gasto)
      .where(inArray(schema.gasto.turnoCajaId, turnoIds));

    return filas.map(({ turno, cajeroNombre }) => {
      const pagosTurno = pagos.filter((p) => p.turnoCajaId === turno.id);
      const gastosTurno = gastos.filter((g) => g.turnoCajaId === turno.id);
      const porCanal = { efectivo: 0, tarjeta: 0, yape_plin: 0, transferencia: 0 };
      for (const p of pagosTurno) {
        const m = p.metodoPago as keyof typeof porCanal;
        if (m in porCanal) porCanal[m] += parseFloat(p.montoTotal);
      }
      const totalTurno = Object.values(porCanal).reduce((s, v) => s + v, 0);
      const totalEfectivo = porCanal.efectivo;
      const totalGastos = gastosTurno.reduce((s, g) => s + parseFloat(g.monto), 0);
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
        totalGastos: totalGastos.toFixed(2),
        montoCierreTeorico: (parseFloat(turno.montoApertura) + totalEfectivo - totalGastos).toFixed(2),
        cobros: pagosTurno.length,
      };
    });
  }

  // ─── Historial de turnos anteriores (para admin) ─────────────────────────

  async getTurnosHistorial() {
    const filas = await this.db
      .select({
        turno: schema.turnoCaja,
        cajeroNombre: schema.user.name,
      })
      .from(schema.turnoCaja)
      .leftJoin(schema.user, eq(schema.turnoCaja.cajeroUsuarioId, schema.user.id))
      .orderBy(desc(schema.turnoCaja.fechaApertura));

    if (!filas.length) return [];

    const turnoIds = filas.map((f) => f.turno.id);
    const pagos = await this.db
      .select()
      .from(schema.pago)
      .where(inArray(schema.pago.turnoCajaId, turnoIds));

    const gastos = await this.db
      .select()
      .from(schema.gasto)
      .where(inArray(schema.gasto.turnoCajaId, turnoIds));

    return filas.map(({ turno, cajeroNombre }) => {
      const pagosTurno = pagos.filter((p) => p.turnoCajaId === turno.id);
      const gastosTurno = gastos.filter((g) => g.turnoCajaId === turno.id);
      const porCanal = { efectivo: 0, tarjeta: 0, yape_plin: 0, transferencia: 0 };
      for (const p of pagosTurno) {
        const m = p.metodoPago as MetodoPago;
        if (m in porCanal) porCanal[m] += parseFloat(p.montoTotal);
      }
      const totalTurno = Object.values(porCanal).reduce((s, v) => s + v, 0);
      const totalGastos = gastosTurno.reduce((s, g) => s + parseFloat(g.monto), 0);
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
        totalGastos: totalGastos.toFixed(2),
        cobros: pagosTurno.length,
      };
    });
  }

  async getTurnoDetalle(turnoId: string) {
    const [turno] = await this.db
      .select({
        turno: schema.turnoCaja,
        cajeroNombre: schema.user.name,
      })
      .from(schema.turnoCaja)
      .leftJoin(schema.user, eq(schema.turnoCaja.cajeroUsuarioId, schema.user.id))
      .where(eq(schema.turnoCaja.id, turnoId));

    if (!turno) throw new NotFoundException('Turno no encontrado');

    const pagos = await this.db
      .select({
        id: schema.pago.id,
        visitaMesaId: schema.pago.visitaMesaId,
        metodoPago: schema.pago.metodoPago,
        montoTotal: schema.pago.montoTotal,
        fechaPago: schema.pago.fechaPago,
        mesaNumero: schema.mesa.numero,
        clienteNombre: schema.visitaMesa.nombreCliente,
        visitaTipo: schema.visitaMesa.tipo,
      })
      .from(schema.pago)
      .leftJoin(schema.visitaMesa, eq(schema.pago.visitaMesaId, schema.visitaMesa.id))
      .leftJoin(schema.mesa, eq(schema.visitaMesa.mesaId, schema.mesa.id))
      .where(eq(schema.pago.turnoCajaId, turnoId))
      .orderBy(schema.pago.fechaPago);

    const gastos = await this.db
      .select()
      .from(schema.gasto)
      .where(eq(schema.gasto.turnoCajaId, turnoId))
      .orderBy(schema.gasto.createdAt);

    const porCanal = { efectivo: 0, tarjeta: 0, yape_plin: 0, transferencia: 0 };
    for (const p of pagos) {
      const m = p.metodoPago as MetodoPago;
      if (m in porCanal) porCanal[m] += parseFloat(p.montoTotal);
    }

    const totalEfectivo = porCanal.efectivo;
    const totalTurno = Object.values(porCanal).reduce((s, v) => s + v, 0);
    const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.monto), 0);

    return {
      ...turno.turno,
      cajeroNombre: turno.cajeroNombre ?? 'Desconocido',
      pagos,
      porCanal: {
        efectivo:      porCanal.efectivo.toFixed(2),
        tarjeta:       porCanal.tarjeta.toFixed(2),
        yape_plin:     porCanal.yape_plin.toFixed(2),
        transferencia: porCanal.transferencia.toFixed(2),
      },
      totalEfectivo:     totalEfectivo.toFixed(2),
      totalTurno:        totalTurno.toFixed(2),
      montoCierreTeorico: (parseFloat(turno.turno.montoApertura) + totalEfectivo).toFixed(2),
    };
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

    const [gastosRecord] = await this.db
      .select({ total: sql<string>`coalesce(sum(${schema.gasto.monto}), '0.00')` })
      .from(schema.gasto)
      .where(eq(schema.gasto.turnoCajaId, turno.id));
    const totalGastos = parseFloat(gastosRecord?.total ?? '0');

    const montoCierreTeorico = parseFloat(turno.montoApertura) + totalEfectivo - totalGastos;
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

  // ─── Crear Pedido Para Llevar desde Caja ─────────────────────────────────

  async crearPedidoLlevar(
    cajeroId: string,
    data: {
      nombreCliente: string;
      items: Array<{ platoCartaId: string; cantidad: number; notas?: string }>;
    },
  ) {
    const nombreCliente = data.nombreCliente.trim();
    if (!nombreCliente) {
      throw new BadRequestException('Se requiere el nombre del cliente');
    }
    if (!data.items?.length) {
      throw new BadRequestException('Debe incluir al menos un plato');
    }

    // Verificar platos y obtener precios
    const platoIds = data.items.map((i) => i.platoCartaId);
    const platos = await this.db
      .select()
      .from(schema.platoCarta)
      .where(inArray(schema.platoCarta.id, platoIds));
    const platoMap = new Map(platos.map((p) => [p.id, p]));

    for (const item of data.items) {
      const plato = platoMap.get(item.platoCartaId);
      if (!plato) throw new NotFoundException(`Plato ${item.platoCartaId} no encontrado`);
      if (!plato.disponible) throw new BadRequestException(`"${plato.nombre}" no está disponible`);
    }

    const [cajero] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, cajeroId));

    const promosPorPlato = await this.promociones.resolverPromocionesVigentes(platoIds);

    const resultado = await this.db.transaction(async (tx) => {
      const [visita] = await tx
        .insert(schema.visitaMesa)
        .values({
          abiertaPorUsuarioId: cajeroId,
          tipo: 'llevar',
          paraLlevar: true,
          nombreCliente,
        })
        .returning();

      const [pedido] = await tx
        .insert(schema.pedido)
        .values({
          visitaMesaId: visita.id,
          tomadoPorUsuarioId: cajeroId,
          paraLlevar: true,
          nombreClienteLlevar: nombreCliente,
        })
        .returning();

      const itemsInsert = data.items.map((i) => {
        const plato = platoMap.get(i.platoCartaId)!;
        const precioBase = parseFloat(plato.precio);
        const promo = promosPorPlato.get(i.platoCartaId);
        const descuentoUnitario = promo
          ? this.promociones.calcularDescuentoUnitario(precioBase, promo)
          : 0;

        return {
          pedidoId: pedido.id,
          platoCartaId: i.platoCartaId,
          cantidad: i.cantidad,
          precioUnitarioCongelado: (precioBase - descuentoUnitario).toFixed(2),
          descuentoUnitario: descuentoUnitario.toFixed(2),
          promocionAplicadaId: promo?.id ?? null,
          notas: i.notas,
        };
      });

      const itemsCreados = await tx
        .insert(schema.itemPedido)
        .values(itemsInsert)
        .returning();

      // Descontar stock para bebidas
      for (const itemCreado of itemsCreados) {
        const plato = platoMap.get(itemCreado.platoCartaId)!;
        if (plato.categoria !== 'bebidas') continue;

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

      return { visita, pedido, items: itemsCreados };
    });

    const CATEGORIAS_NO_COCINA = new Set(['bebidas', 'refrescos_jugos', 'cocteles', 'extras']);
    const itemsCocina = resultado.items.filter((i) => {
      const plato = platoMap.get(i.platoCartaId);
      return plato && !CATEGORIAS_NO_COCINA.has(plato.categoria);
    });

    if (itemsCocina.length > 0) {
      this.printer.printKitchenTicket({
        pedidoId: resultado.pedido.id,
        numeroCorto: resultado.pedido.numeroCorto,
        visitaId: resultado.visita.id,
        mesaNumero: 0,
        mesero: cajero?.name ?? cajeroId,
        paraLlevar: true,
        nombreClienteLlevar: nombreCliente,
        items: itemsCocina.map((i) => ({
          nombre: platoMap.get(i.platoCartaId)!.nombre,
          cantidad: i.cantidad,
          notas: i.notas,
        })),
        fechaCreacion: resultado.pedido.fechaCreacion,
      }).catch((err) => {
        this.logger.error(`Error al imprimir ticket de cocina (Llevar): ${err.message}`, err.stack);
      });
    }

    return { ok: true, visitaId: resultado.visita.id };
  }

  // ─── Crear Pedido Delivery desde Caja ────────────────────────────────────

  async crearPedidoDelivery(
    cajeroId: string,
    data: {
      nombreCliente: string;
      telefonoCliente?: string;
      direccionDelivery: string;
      costoEnvio: number;
      items: Array<{ platoCartaId: string; cantidad: number; notas?: string }>;
    },
  ) {
    const nombreCliente = data.nombreCliente.trim();
    const direccionDelivery = data.direccionDelivery.trim();
    if (!nombreCliente) {
      throw new BadRequestException('Se requiere el nombre del cliente');
    }
    if (!direccionDelivery) {
      throw new BadRequestException('Se requiere la dirección de entrega');
    }
    if (!data.items?.length) {
      throw new BadRequestException('Debe incluir al menos un plato');
    }

    // Verificar platos
    const platoIds = data.items.map((i) => i.platoCartaId);
    const platos = await this.db
      .select()
      .from(schema.platoCarta)
      .where(inArray(schema.platoCarta.id, platoIds));
    const platoMap = new Map(platos.map((p) => [p.id, p]));

    for (const item of data.items) {
      const plato = platoMap.get(item.platoCartaId);
      if (!plato) throw new NotFoundException(`Plato ${item.platoCartaId} no encontrado`);
      if (!plato.disponible) throw new BadRequestException(`"${plato.nombre}" no está disponible`);
    }

    const [cajero] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, cajeroId));

    const promosPorPlato = await this.promociones.resolverPromocionesVigentes(platoIds);

    const resultado = await this.db.transaction(async (tx) => {
      const [visita] = await tx
        .insert(schema.visitaMesa)
        .values({
          abiertaPorUsuarioId: cajeroId,
          tipo: 'delivery',
          paraLlevar: true,
          nombreCliente,
          telefonoCliente: data.telefonoCliente?.trim() || null,
          direccionDelivery,
          costoEnvio: data.costoEnvio.toFixed(2),
        })
        .returning();

      const [pedido] = await tx
        .insert(schema.pedido)
        .values({
          visitaMesaId: visita.id,
          tomadoPorUsuarioId: cajeroId,
          paraLlevar: true,
          nombreClienteLlevar: nombreCliente,
        })
        .returning();

      const itemsInsert = data.items.map((i) => {
        const plato = platoMap.get(i.platoCartaId)!;
        const precioBase = parseFloat(plato.precio);
        const promo = promosPorPlato.get(i.platoCartaId);
        const descuentoUnitario = promo
          ? this.promociones.calcularDescuentoUnitario(precioBase, promo)
          : 0;

        return {
          pedidoId: pedido.id,
          platoCartaId: i.platoCartaId,
          cantidad: i.cantidad,
          precioUnitarioCongelado: (precioBase - descuentoUnitario).toFixed(2),
          descuentoUnitario: descuentoUnitario.toFixed(2),
          promocionAplicadaId: promo?.id ?? null,
          notas: i.notas,
        };
      });

      const itemsCreados = await tx
        .insert(schema.itemPedido)
        .values(itemsInsert)
        .returning();

      // Descontar stock para bebidas
      for (const itemCreado of itemsCreados) {
        const plato = platoMap.get(itemCreado.platoCartaId)!;
        if (plato.categoria !== 'bebidas') continue;

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

      return { visita, pedido, items: itemsCreados };
    });

    const CATEGORIAS_NO_COCINA = new Set(['bebidas', 'refrescos_jugos', 'cocteles', 'extras']);
    const itemsCocina = resultado.items.filter((i) => {
      const plato = platoMap.get(i.platoCartaId);
      return plato && !CATEGORIAS_NO_COCINA.has(plato.categoria);
    });

    if (itemsCocina.length > 0) {
      this.printer.printKitchenTicket({
        pedidoId: resultado.pedido.id,
        numeroCorto: resultado.pedido.numeroCorto,
        visitaId: resultado.visita.id,
        mesaNumero: 0,
        mesero: cajero?.name ?? cajeroId,
        paraLlevar: true,
        nombreClienteLlevar: nombreCliente,
        items: itemsCocina.map((i) => ({
          nombre: platoMap.get(i.platoCartaId)!.nombre,
          cantidad: i.cantidad,
          notas: i.notas,
        })),
        fechaCreacion: resultado.pedido.fechaCreacion,
      }).catch((err) => {
        this.logger.error(`Error al imprimir ticket de cocina (Delivery): ${err.message}`, err.stack);
      });
    }

    return { ok: true, visitaId: resultado.visita.id };
  }
}

