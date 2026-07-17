export class RefundService {
  submit(paymentId: string): string {
    return `refund:${paymentId}`
  }
}
