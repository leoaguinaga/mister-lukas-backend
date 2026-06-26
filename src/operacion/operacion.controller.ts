import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { OperacionService } from './operacion.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller()
@UseGuards(AuthGuard)
export class OperacionController {
  constructor(private readonly operacion: OperacionService) {}

  @Get('monitor')
  getMonitor() {
    return this.operacion.getMonitor();
  }

  @Get('tables/:id/active-visit')
  getVisitaActiva(@Param('id') mesaId: string) {
    return this.operacion.getVisitaActivaPorMesa(mesaId);
  }

  @Post('tables/:id/open')
  abrirMesa(@Param('id') mesaId: string, @Request() req: { user: { id: string } }) {
    return this.operacion.abrirMesa(mesaId, req.user.id);
  }

  @Get('visits/:id')
  getVisita(@Param('id') visitaId: string) {
    return this.operacion.getVisita(visitaId);
  }

  @Post('visits/:id/orders')
  crearPedido(
    @Param('id') visitaId: string,
    @Request() req: { user: { id: string } },
    @Body() body: { items: Array<{ platoCartaId: string; cantidad: number; notas?: string }> },
  ) {
    return this.operacion.crearPedido(visitaId, req.user.id, body.items);
  }

  @Patch('orders/:id/status')
  cambiarEstado(
    @Param('id') pedidoId: string,
    @Body() body: { estado: 'en_preparacion' | 'listo' | 'entregado' | 'cancelado' },
  ) {
    return this.operacion.cambiarEstadoPedido(pedidoId, body.estado);
  }

  @Post('visits/:id/close')
  cerrarVisita(@Param('id') visitaId: string) {
    return this.operacion.cerrarVisita(visitaId);
  }

  @Post('visits/llevar')
  abrirVisitaParaLlevar(@Request() req: { user: { id: string } }) {
    return this.operacion.abrirVisitaParaLlevar(req.user.id);
  }
}
