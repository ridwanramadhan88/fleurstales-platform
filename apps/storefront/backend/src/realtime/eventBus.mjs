export class RealtimeEventBus {
  constructor() {
    this.stateClients = new Set()
    this.orderClients = new Set()
  }

  addStateClient(client) { this.stateClients.add(client); return () => this.stateClients.delete(client) }
  addOrderClient(client) { this.orderClients.add(client); return () => this.orderClients.delete(client) }

  emitState(event) {
    const line = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.stateClients) {
      if (!client.key || client.key === event.key) client.res.write(line)
    }
  }

  emitOrder(event, branch) {
    const line = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.orderClients) {
      if (!client.branch || client.branch === 'All' || !branch || client.branch === branch) client.res.write(line)
    }
  }

  get connectedDevices() { return this.stateClients.size + this.orderClients.size }
}
