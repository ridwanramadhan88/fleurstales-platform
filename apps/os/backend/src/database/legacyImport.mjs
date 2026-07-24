import { existsSync, readFileSync } from 'node:fs'

export const importLegacyStateFile = ({ legacyStateFile, operationalStateService, resourceRepository, auditRepository }) => {
  if (!existsSync(legacyStateFile) || operationalStateService.get().value) return false
  let legacy
  try { legacy = JSON.parse(readFileSync(legacyStateFile, 'utf8')) } catch { return false }
  const resources = legacy?.resources && typeof legacy.resources === 'object' ? legacy.resources : {}
  const operational = resources['operational-state']
  if (operational?.value) {
    let snapshot
    try { snapshot = JSON.parse(operational.value) } catch { snapshot = undefined }
    if (snapshot?.state) {
      operationalStateService.repository.save(snapshot, 0, operational.updatedBy || 'legacy-import')
    }
  }
  for (const [key, value] of Object.entries(resources)) {
    if (key === 'operational-state' || !value || typeof value !== 'object') continue
    resourceRepository.put(key, value.value ?? '', 0, value.updatedBy || 'legacy-import')
  }
  for (const event of Array.isArray(legacy?.audit) ? legacy.audit : []) {
    auditRepository.append({
      action: event.action || 'legacy.event', entityType: 'legacy_resource', entityId: event.key,
      actor: { employeeId: event.actorId, role: event.actorRole, branchId: event.branchId },
      revision: event.revision, metadata: { legacyAt: event.at },
    })
  }
  return true
}
