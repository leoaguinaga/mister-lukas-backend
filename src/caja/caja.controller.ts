import { Controller, Get, Post, Body, Param, UseGuards, Request, Patch, Delete } from '@nestjs/common';
import { CajaService } from './caja.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

@Controller('cash')
@UseGuards(AuthGuard)
@Roles('cajero', 'administracion')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get('shift/current')
  getTurnoActual(@Request() req: { user: { id: string } }) {
    return this.caja.getTurnoConPagos(req.user.id);
  }

  @Post('shift/open')
  abrirTurno(
    @Request() req: { user: { id: string } },
    @Body() body: { montoApertura: number },
  ) {
    return this.caja.abrirTurno(req.user.id, body.montoApertura);
  }

  @Post('shift/close')
  cerrarTurno(
    @Request() req: { user: { id: string } },
    @Body() body: { montoCierreReal: number },
  ) {
    return this.caja.cerrarTurno(req.user.id, body.montoCierreReal);
  }

  @Post('shift/expense')
  registrarGasto(
    @Request() req: { user: { id: string } },
    @Body() body: { monto: number; motivo: string },
  ) {
    return this.caja.registrarGasto(req.user.id, body);
  }  @Patch('shift/expense/:id')
  editarGasto(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body() body: { monto: number; motivo: string },
  ) {
    return this.caja.editarGasto(req.user.id, id, body);
  }

  @Delete('shift/expense/:id')
  eliminarGasto(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.caja.eliminarGasto(req.user.id, id);
  }

  @Get('shifts')
  getTurnosHoy() {
    return this.caja.getTurnosHoy();
  }

  @Get('shifts/history')
  getTurnosHistorial() {
    return this.caja.getTurnosHistorial();
  }

  @Get('shifts/:id')
  getTurnoDetalle(@Param('id') id: string) {
    return this.caja.getTurnoDetalle(id);
  }

  @Get('visits-to-collect')
  getMesasParaCobrar() {
    return this.caja.getMesasParaCobrar();
  }

  @Get('visits/:id')
  getDetalleVisita(@Param('id') visitaId: string) {
    return this.caja.getDetalleVisita(visitaId);
  }

  @Post('visits/:id/pay')
  registrarPago(
    @Param('id') visitaId: string,
    @Request() req: { user: { id: string } },
    @Body() body: {
      pagos: Array<{ metodoPago: 'efectivo' | 'tarjeta' | 'yape_plin' | 'transferencia'; monto: number }>;
      ajuste?: { monto: number; motivo: string };
    },
  ) {
    return this.caja.registrarPago(req.user.id, visitaId, body.pagos, body.ajuste);
  }

  @Post('visits/:id/print-precuenta')
  imprimirPrecuenta(@Param('id') visitaId: string) {
    return this.caja.imprimirPrecuenta(visitaId);
  }

  @Post('pedidos/llevar')
  crearPedidoLlevar(
    @Request() req: { user: { id: string } },
    @Body() body: {
      nombreCliente: string;
      items: Array<{ platoCartaId: string; cantidad: number; notas?: string }>;
    },
  ) {
    return this.caja.crearPedidoLlevar(req.user.id, body);
  }

  @Post('pedidos/delivery')
  crearPedidoDelivery(
    @Request() req: { user: { id: string } },
    @Body() body: {
      nombreCliente: string;
      telefonoCliente?: string;
      direccionDelivery: string;
      costoEnvio: number;
      items: Array<{ platoCartaId: string; cantidad: number; notas?: string }>;
    },
  ) {
    return this.caja.crearPedidoDelivery(req.user.id, body);
  }
}
