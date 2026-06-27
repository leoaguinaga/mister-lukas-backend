import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { KitchenTicketData, PrintService, ReceiptData } from './print.interface';

@Injectable()
export class RealPrintService implements PrintService {
  private readonly logger = new Logger(RealPrintService.name);

  private get kitchenPrinter() {
    return {
      ip:   process.env.PRINTER_KITCHEN_IP ?? '',
      port: parseInt(process.env.PRINTER_KITCHEN_PORT ?? '9100'),
    };
  }

  private get receiptPrinter() {
    return {
      ip:   process.env.PRINTER_RECEIPT_IP ?? '',
      port: parseInt(process.env.PRINTER_RECEIPT_PORT ?? '9100'),
    };
  }

  async printKitchenTicket(data: KitchenTicketData): Promise<void> {
    const { ip, port } = this.kitchenPrinter;
    if (!ip) { this.logger.warn('[REAL] PRINTER_KITCHEN_IP no configurada'); return; }
    await this.sendTcp(ip, port, this.buildKitchenTicket(data));
    this.logger.log(`[REAL] Comanda → Mesa ${data.mesaNumero} (${ip}:${port})`);
  }

  async printReceipt(data: ReceiptData): Promise<void> {
    const { ip, port } = this.receiptPrinter;
    if (!ip) { this.logger.warn('[REAL] PRINTER_RECEIPT_IP no configurada'); return; }
    await this.sendTcp(ip, port, this.buildReceipt(data));
    this.logger.log(`[REAL] Recibo → Mesa ${data.mesaNumero} S/${data.total} (${ip}:${port})`);
  }

  private sendTcp(ip: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(port, ip, () => {
        socket.write(data, (err) => {
          if (err) { socket.destroy(); reject(err); }
          else { socket.end(); resolve(); }
        });
      });
      socket.on('error', reject);
      socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timeout ticketera ${ip}`)); });
    });
  }

  private buildKitchenTicket(data: KitchenTicketData): Buffer {
    const ESC = '\x1b'; const GS = '\x1d'; const LF = '\x0a';
    const fecha = data.fechaCreacion.toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });

    const parts = [
      `${ESC}\x40`,
      `${ESC}\x61\x01`,
      `${ESC}\x45\x01`, `MISTER LUKA${LF}`,
      `** COCINA **${LF}`,
      `${ESC}\x45\x00`,
      `--------------------------------${LF}`,
      `${ESC}\x61\x00`,
      `Mesa:   ${data.mesaNumero}${LF}`,
      `Mesero: ${data.mesero}${LF}`,
      `Hora:   ${fecha}${LF}`,
      `ID:     ${data.pedidoId.slice(0, 8)}${LF}`,
      `--------------------------------${LF}`,
      ...data.items.flatMap((item) => [
        `${ESC}\x45\x01`, `${item.cantidad}x ${item.nombre}${LF}`, `${ESC}\x45\x00`,
        ...(item.notas ? [`   -> ${item.notas}${LF}`] : []),
      ]),
      `--------------------------------${LF}`,
      `${LF}${LF}${LF}`,
      `${GS}\x56\x42\x00`,
    ];
    return Buffer.from(parts.join(''), 'latin1');
  }

  private buildReceipt(data: ReceiptData): Buffer {
    const ESC = '\x1b'; const GS = '\x1d'; const LF = '\x0a';
    const fecha = data.fechaPago.toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });

    const itemLines = data.items.flatMap((i) => {
      const subtotal = (parseFloat(i.precioUnitario) * i.cantidad).toFixed(2);
      const nombre   = i.nombre.length > 20 ? i.nombre.slice(0, 19) + '.' : i.nombre;
      const linea    = `${i.cantidad}x ${nombre.padEnd(22)} S/${subtotal}${LF}`;
      const descU    = parseFloat(i.descuentoUnitario ?? '0');
      if (descU > 0) {
        const totalDesc = (descU * i.cantidad).toFixed(2);
        return [linea, `   Promo (-S/${totalDesc})${LF}`];
      }
      return [linea];
    });

    const tieneDescuento = parseFloat(data.descuentoTotal ?? '0') > 0;
    const subtotalBruto  = (parseFloat(data.total) + parseFloat(data.descuentoTotal ?? '0')).toFixed(2);

    const parts = [
      `${ESC}\x40`,
      `${ESC}\x61\x01`,
      `${ESC}\x45\x01`, `MISTER LUKA${LF}`, `${ESC}\x45\x00`,
      `Pollo a la Brasa & Mas${LF}`,
      `--------------------------------${LF}`,
      `${ESC}\x61\x00`,
      `Mesa:   ${data.mesaNumero}${LF}`,
      `Fecha:  ${fecha}${LF}`,
      `--------------------------------${LF}`,
      ...itemLines,
      `--------------------------------${LF}`,
      ...(tieneDescuento
        ? [
            `Subtotal:           S/${subtotalBruto.padStart(6)}${LF}`,
            `Descuento:         -S/${data.descuentoTotal!.padStart(6)}${LF}`,
          ]
        : []),
      `TOTAL:              S/${data.total.padStart(6)}${LF}`,
      `Metodo: ${data.metodoPago}${LF}`,
      `--------------------------------${LF}`,
      `${ESC}\x61\x01`,
      `Gracias por venir!${LF}`,
      `${LF}${LF}${LF}`,
      `${GS}\x56\x42\x00`,
    ];
    return Buffer.from(parts.join(''), 'latin1');
  }
}
