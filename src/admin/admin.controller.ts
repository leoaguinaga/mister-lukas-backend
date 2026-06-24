import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

@Controller('admin')
@UseGuards(AuthGuard)
@Roles('administracion')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
