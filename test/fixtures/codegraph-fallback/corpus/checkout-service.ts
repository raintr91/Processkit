export class CheckoutService {
  submit(orderId: string): string {
    return `checkout:${orderId}`
  }
}
