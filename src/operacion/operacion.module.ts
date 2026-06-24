import { Module } from '@nestjs/common';
import { OperacionController } from './operacion.controller';
import { OperacionService } from './operacion.service';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [OperacionController],
  providers: [OperacionService],
  exports: [OperacionService],
})
export class OperacionModule {}
