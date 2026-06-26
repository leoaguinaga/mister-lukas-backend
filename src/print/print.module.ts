import { Module } from '@nestjs/common';
import { MockPrintService } from './mock-print.service';
import { RealPrintService } from './real-print.service';
import { PRINT_SERVICE } from './print.interface';
import { DevPrintController } from './dev-print.controller';
import { PrinterManagementService } from './printer-management.service';

const printServiceProvider = {
  provide: PRINT_SERVICE,
  useClass: process.env.PRINTER_MODE === 'real' ? RealPrintService : MockPrintService,
};

@Module({
  controllers: [DevPrintController],
  providers: [printServiceProvider, MockPrintService, RealPrintService, PrinterManagementService],
  exports: [PRINT_SERVICE, PrinterManagementService],
})
export class PrintModule {}
