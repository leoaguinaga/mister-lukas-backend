import { Module } from '@nestjs/common';
import { MockPrintService } from './mock-print.service';
import { RealPrintService } from './real-print.service';
import { PRINT_SERVICE } from './print.interface';
import { DevPrintController } from './dev-print.controller';

const printServiceProvider = {
  provide: PRINT_SERVICE,
  useClass: process.env.PRINTER_MODE === 'real' ? RealPrintService : MockPrintService,
};

@Module({
  controllers: [DevPrintController],
  providers: [printServiceProvider, MockPrintService, RealPrintService],
  exports: [PRINT_SERVICE],
})
export class PrintModule {}
