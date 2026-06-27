export interface KitchenTicketData {
  pedidoId: string;
  mesaNumero: number;
  visitaId: string;
  mesero: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    notas?: string | null;
  }>;
  fechaCreacion: Date;
}

export interface ReceiptData {
  visitaId: string;
  mesaNumero: number;
  items: Array<{
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    descuentoUnitario?: string;
  }>;
  total: string;
  descuentoTotal?: string;
  metodoPago: string;
  fechaPago: Date;
}

export const PRINT_SERVICE = Symbol('PRINT_SERVICE');

export interface PrintService {
  printKitchenTicket(data: KitchenTicketData): Promise<void>;
  printReceipt(data: ReceiptData): Promise<void>;
}
