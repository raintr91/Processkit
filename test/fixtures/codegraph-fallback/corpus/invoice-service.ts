export class InvoiceService {
  create(orderId: string): string {
    return `invoice:${orderId}`
  }
}
