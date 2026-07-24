export class OperationalStateService {
  constructor({ repository, fileStorage, auditRepository, backup }) {
    this.repository = repository
    this.fileStorage = fileStorage
    this.auditRepository = auditRepository
    this.backup = backup
  }

  get() { return this.repository.getResource() }

  async save({ serializedSnapshot, expectedRevision, actor, req }) {
    let snapshot
    try { snapshot = JSON.parse(String(serializedSnapshot || '')) } catch {
      throw Object.assign(new Error('Operational snapshot is not valid JSON.'), { statusCode: 400 })
    }
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.state || typeof snapshot.state !== 'object') {
      throw Object.assign(new Error('Operational snapshot is incomplete.'), { statusCode: 400 })
    }
    const previousSnapshot = this.repository.readSnapshot()
    const normalized = await this.fileStorage.normalizeStoreLogo(snapshot, previousSnapshot, actor, req)
    await this.backup()
    const result = this.repository.save(normalized.snapshot, expectedRevision, actor.employeeId)
    if (result.conflict) {
      if (normalized.createdValue) await this.fileStorage.removeByValue(normalized.createdValue)
      return result
    }
    if (normalized.cleanupValue) await this.fileStorage.removeByValue(normalized.cleanupValue)
    this.auditRepository.append({
      action: 'operational_state.updated', entityType: 'operational_state', entityId: 'current',
      actor, revision: result.value.revision,
    })
    return result
  }

  async remove(actor) {
    const previous = this.repository.readSnapshot()
    const previousLogo = previous?.state?.settings?.storeProfile?.logoUrl
    await this.backup()
    this.repository.remove()
    if (previousLogo) await this.fileStorage.removeByValue(previousLogo)
    this.auditRepository.append({ action: 'operational_state.deleted', entityType: 'operational_state', entityId: 'current', actor })
  }

  listOrders(branch) { return this.repository.listOrders(branch) }

  async updateOrder({ orderId, expectedRevision, order, actor }) {
    await this.backup()
    const result = this.repository.updateOrder(orderId, expectedRevision, order, actor.employeeId)
    if (!result.conflict && !result.notFound) {
      this.auditRepository.append({
        action: 'order.updated', entityType: 'order', entityId: orderId,
        actor, revision: result.order.revision,
      })
    }
    return result
  }
}
