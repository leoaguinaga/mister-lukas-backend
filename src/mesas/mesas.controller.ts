import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { AuthGuard, Roles } from '../auth/auth.guard';

@Controller('tables')
export class MesasController {
  constructor(private readonly mesas: MesasService) {}

  @Get()
  @UseGuards(AuthGuard)
  findAll() {
    return this.mesas.findAll();
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  findOne(@Param('id') id: string) {
    return this.mesas.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @Roles('administracion')
  create(@Body() body: { numero: number; capacidad?: number }) {
    return this.mesas.create(body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.mesas.update(id, body as Parameters<MesasService['update']>[1]);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @Roles('administracion')
  remove(@Param('id') id: string) {
    return this.mesas.delete(id);
  }
}
