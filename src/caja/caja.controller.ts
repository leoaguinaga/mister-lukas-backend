import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
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

  @Get('shifts')
  getTurnosHoy() {
    return this.caja.getTurnosHoy();
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
    @Body() body: { pagos: Array<{ metodoPago: 'efectivo' | 'tarjeta' | 'yape_plin' | 'transferencia'; monto: number }> },
  ) {
    return this.caja.registrarPago(req.user.id, visitaId, body.pagos);
  }
}
