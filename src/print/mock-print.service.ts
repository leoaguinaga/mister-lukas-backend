import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { KitchenTicketData, PrintService, ReceiptData } from './print.interface';

const TICKETS_DIR = path.join(process.cwd(), 'dev-tickets');

function ensureDir() {
  if (!fs.existsSync(TICKETS_DIR)) fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

function formatDate(d: Date) {
  return d.toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });
}

@Injectable()
export class MockPrintService implements PrintService {
  private readonly logger = new Logger(MockPrintService.name);

  async printKitchenTicket(data: KitchenTicketData): Promise<void> {
    ensureDir();

    const lineas = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '          MISTER LUKA             ',
      '          ** COCINA **            ',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Mesa:    ${data.mesaNumero}`,
      `Mesero:  ${data.mesero}`,
      `Hora:    ${formatDate(data.fechaCreacion)}`,
      `ID:      ${data.pedidoId.slice(0, 8)}`,
      '─────────────────────────────────',
      ...data.items.map((item) =>
        [`${item.cantidad}x  ${item.nombre}`, item.notas ? `     → ${item.notas}` : '']
          .filter(Boolean)
          .join('\n'),
      ),
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ];

    const contenido = lineas.join('\n');
    fs.writeFileSync(path.join(TICKETS_DIR, 'last-kitchen-ticket.txt'), contenido, 'utf8');
    this.logger.log(`[MOCK] Comanda impresa — Mesa ${data.mesaNumero}, ${data.items.length} item(s)`);
  }

  async printReceipt(data: ReceiptData): Promise<void> {
    ensureDir();

    const itemLines = data.items.flatMap((i) => {
      const subtotal = (parseFloat(i.precioUnitario) * i.cantidad).toFixed(2);
      const nombre = i.nombre.length > 20 ? i.nombre.slice(0, 19) + '…' : i.nombre;
      const linea = `${i.cantidad}x ${nombre.padEnd(22)} S/${subtotal}`;
      const descU = parseFloat(i.descuentoUnitario ?? '0');
      if (descU > 0) {
        const totalDesc = (descU * i.cantidad).toFixed(2);
        return [linea, `     ↳ Promo (-S/${totalDesc})`];
      }
      return [linea];
    });

    const tieneDescuento = parseFloat(data.descuentoTotal ?? '0') > 0;
    const subtotalBruto = (parseFloat(data.total) + parseFloat(data.descuentoTotal ?? '0')).toFixed(2);

    const lineas = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '          MISTER LUKA             ',
      '    Pollo a la Brasa & Más        ',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Mesa:    ${data.mesaNumero}`,
      `Fecha:   ${formatDate(data.fechaPago)}`,
      '─────────────────────────────────',
      ...itemLines,
      '─────────────────────────────────',
      ...(tieneDescuento
        ? [
            `Subtotal:                  S/${subtotalBruto.padStart(6)}`,
            `Descuento:                -S/${data.descuentoTotal!.padStart(6)}`,
          ]
        : []),
      `TOTAL:                     S/${data.total.padStart(6)}`,
      `Método:  ${data.metodoPago}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '        ¡Gracias por venir!       ',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ];

    const contenido = lineas.join('\n');
    fs.writeFileSync(path.join(TICKETS_DIR, 'last-receipt.txt'), contenido, 'utf8');
    this.logger.log(`[MOCK] Recibo impreso — Mesa ${data.mesaNumero}, S/${data.total} (${data.metodoPago})`);
  }
}
