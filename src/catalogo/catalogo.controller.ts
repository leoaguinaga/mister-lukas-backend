import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

@Controller()
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  // ─── Público (mesero puede ver la carta sin guard de admin) ───

  @Get('menu')
  getMenu() {
    return this.catalogo.findPlatosDisponibles();
  }

  // ─── Insumos (admin) ───

  @Get('insumos')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  getInsumos() {
    return this.catalogo.findAllInsumos();
  }

  @Post('insumos')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  createInsumo(@Body() body: { nombre: string; unidadesPorUnidadDeCompra?: number; nombreUnidadMinima?: string; stockActual?: number }) {
    return this.catalogo.createInsumo(body);
  }

  @Patch('insumos/:id')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  updateInsumo(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.catalogo.updateInsumo(id, body as Parameters<CatalogoService['updateInsumo']>[1]);
  }

  // ─── Platos (admin para CRUD, mesero/cajero para toggle disponibilidad) ───

  @Get('platos')
  @UseGuards(AuthGuard)
  getPlatos() {
    return this.catalogo.findAllPlatos();
  }

  @Get('platos/:id')
  @UseGuards(AuthGuard)
  getPlato(@Param('id') id: string) {
    return this.catalogo.findPlatoById(id);
  }

  @Post('platos')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  createPlato(@Body() body: { nombre: string; precio: string; categoriaInventario: 'fraccionable' | 'reventa' | 'multi_insumo'; tipoPlato?: string; descripcion?: string }) {
    return this.catalogo.createPlato(body as Parameters<CatalogoService['createPlato']>[0]);
  }

  @Patch('platos/:id')
  @UseGuards(AuthGuard)
  updatePlato(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.catalogo.updatePlato(id, body as Parameters<CatalogoService['updatePlato']>[1]);
  }

  // ─── Recetas (admin) ───

  @Get('platos/:id/recetas')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  getRecetas(@Param('id') id: string) {
    return this.catalogo.findRecetasByPlato(id);
  }

  @Post('platos/:id/recetas')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  createReceta(@Param('id') platoCartaId: string, @Body() body: { insumoId: string; cantidadConsumida: number }) {
    return this.catalogo.createReceta({ platoCartaId, ...body });
  }

  @Delete('recetas/:id')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  deleteReceta(@Param('id') id: string) {
    return this.catalogo.deleteReceta(id);
  }
}
