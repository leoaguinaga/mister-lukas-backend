import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';

export interface PrinterInfo {
  tipo: 'cocina' | 'recibos';
  label: string;
  ip: string;
  port: number;
  online: boolean;
  latencyMs?: number;
}

@Injectable()
export class PrinterManagementService {
  private readonly logger = new Logger(PrinterManagementService.name);

  private get printers(): Array<{ tipo: 'cocina' | 'recibos'; label: string; ip: string; port: number }> {
    return [
      {
        tipo: 'cocina',
        label: 'Cocina / Comanda',
        ip: process.env.PRINTER_KITCHEN_IP ?? '',
        port: parseInt(process.env.PRINTER_KITCHEN_PORT ?? '9100'),
      },
      {
        tipo: 'recibos',
        label: 'Caja / Recibos',
        ip: process.env.PRINTER_RECEIPT_IP ?? '',
        port: parseInt(process.env.PRINTER_RECEIPT_PORT ?? '9100'),
      },
    ];
  }

  async getTicketeras(): Promise<PrinterInfo[]> {
    return Promise.all(
      this.printers.map(async (p) => {
        if (!p.ip) return { ...p, online: false };
        const { online, latencyMs } = await this.probe(p.ip, p.port);
        return { ...p, online, latencyMs };
      }),
    );
  }

  async testPrint(tipo: 'cocina' | 'recibos'): Promise<void> {
    const printer = this.printers.find((p) => p.tipo === tipo);
    if (!printer || !printer.ip) throw new Error(`Ticketera "${tipo}" sin IP configurada`);
    const buf = this.buildTestPage(printer.label, printer.ip);
    await this.sendTcp(printer.ip, printer.port, buf);
    this.logger.log(`[MGMT] Prueba de impresión enviada a ${printer.label} (${printer.ip}:${printer.port})`);
  }

  private probe(ip: string, port: number, timeoutMs = 2000): Promise<{ online: boolean; latencyMs?: number }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.connect(port, ip, () => {
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ online: true, latencyMs });
      });
      socket.on('error', () => resolve({ online: false }));
      socket.on('timeout', () => { socket.destroy(); resolve({ online: false }); });
    });
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
      socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timeout al conectar con ticketera ${ip}`)); });
    });
  }

  private buildTestPage(label: string, ip: string): Buffer {
    const ESC = '\x1b';
    const GS  = '\x1d';
    const LF  = '\x0a';

    const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });

    const parts = [
      `${ESC}\x40`,
      `${ESC}\x61\x01`,
      `${ESC}\x45\x01`,
      `MISTER LUKA${LF}`,
      `${ESC}\x45\x00`,
      `PRUEBA DE IMPRESION${LF}`,
      `--------------------------------${LF}`,
      `${ESC}\x61\x00`,
      `Ticketera: ${label}${LF}`,
      `IP:        ${ip}${LF}`,
      `Hora:      ${fecha}${LF}`,
      `--------------------------------${LF}`,
      `${ESC}\x61\x01`,
      `Funciona correctamente${LF}`,
      `${LF}${LF}${LF}`,
      `${GS}\x56\x42\x00`,
    ];

    return Buffer.from(parts.join(''), 'latin1');
  }
}
