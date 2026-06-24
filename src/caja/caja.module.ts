import { Module } from '@nestjs/common';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
