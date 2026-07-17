export class ShipmentService {
  dispatch(orderId: string): string {
    return `shipment:${orderId}`
  }
}
