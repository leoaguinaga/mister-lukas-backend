import { Module } from '@nestjs/common';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { PrintModule } from '../print/print.module';
import { PromocionesModule } from '../promociones/promociones.module';

@Module({
  imports: [PrintModule, PromocionesModule],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
