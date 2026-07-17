export class CustomerService {
  find(customerId: string): string {
    return `customer:${customerId}`
  }
}
