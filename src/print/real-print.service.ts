import { Injectable, Logger } from '@nestjs/common';
import { KitchenTicketData, PrintService, ReceiptData } from './print.interface';

// Implementación pendiente hasta tener hardware disponible.
// Protocolo: ESC/POS vía socket TCP (ticketera LAN) o USB (ticketera recibos).
// Configurar IP, puerto y ancho de papel (58mm / 80mm) en .env al tener el modelo.

@Injectable()
export class RealPrintService implements PrintService {
  private readonly logger = new Logger(RealPrintService.name);

  async printKitchenTicket(_data: KitchenTicketData): Promise<void> {
    this.logger.warn('[REAL] printKitchenTicket — ESC/POS no implementado aún');
  }

  async printReceipt(_data: ReceiptData): Promise<void> {
    this.logger.warn('[REAL] printReceipt — ESC/POS no implementado aún');
  }
}
