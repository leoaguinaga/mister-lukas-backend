import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { PrinterManagementService } from '../print/printer-management.service';

@Controller('admin')
@UseGuards(AuthGuard)
@Roles('administracion')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly printerMgmt: PrinterManagementService,
  ) {}

  @Get('users')
  listUsuarios() {
    return this.admin.listUsuarios();
  }

  @Post('users')
  crearUsuario(
    @Body() body: { name: string; email: string; password: string; role: 'mesero' | 'cajero' | 'administracion' },
  ) {
    return this.admin.crearUsuario(body);
  }

  @Patch('users/:id')
  updateUsuario(
    @Param('id') id: string,
    @Body() body: { activo?: boolean; role?: 'mesero' | 'cajero' | 'administracion' },
  ) {
    return this.admin.updateUsuario(id, body);
  }

  // ─── Ticketeras ────────────────────────────────────────────────────────────

  @Get('ticketeras')
  getTicketeras() {
    return this.printerMgmt.getTicketeras();
  }

  @Post('ticketeras/:tipo/test')
  async testPrint(@Param('tipo') tipo: string) {
    if (tipo !== 'cocina' && tipo !== 'recibos') throw new BadRequestException('tipo inválido');
    await this.printerMgmt.testPrint(tipo as 'cocina' | 'recibos');
    return { ok: true };
  }

  // ─── Stock ─────────────────────────────────────────────────────────────────

  @Get('stock')
  getStock() {
    return this.admin.getStock();
  }

  @Post('stock/ajuste')
  ajustarStock(
    @Body() body: { insumoId: string; cantidad: number; notas?: string },
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id ?? 'sistema';
    return this.admin.ajustarStock(body.insumoId, body.cantidad, body.notas ?? '', userId);
  }

  @Post('stock/sync')
  syncDisponible() {
    return this.admin.syncDisponible();
  }
}
