import { useState } from 'react'
import { useCatalogStore } from '../../store/catalogStore'
import { toast } from '../../hooks/use-toast'
import type { CatalogCategoryConfig } from '../../store/catalogStoreTypes'
import type { CatalogCategoriesDialogProps } from './CatalogCategoriesDialog'
import { requestAppConfirmation } from '../ui/app-confirm'
import { productUsesCatalogCategory } from '../../domain/catalogCategoryDomain'

export interface CatalogCategoryRow {
  id: string
  name: string
  prefix: string
  activeProductCount: number
  inactiveProductCount: number
  inactivePrimaryProductCount: number
  isProtected: boolean
}

export interface CatalogCategoriesDialogViewModel extends CatalogCategoriesDialogProps {
  rows: CatalogCategoryRow[]
  newName: string
  newPrefix: string
  editingId: string | null
  editingName: string
  editingPrefix: string
  onNewNameChange: (value: string) => void
  onNewPrefixChange: (value: string) => void
  onEditingNameChange: (value: string) => void
  onEditingPrefixChange: (value: string) => void
  onAdd: () => void
  onStartEditing: (id: string, currentName: string, currentPrefix: string) => void
  onCancelEditing: () => void
  onCommitEditing: () => void
  onDelete: (row: CatalogCategoryRow) => Promise<void>
}

export const useCatalogCategoriesDialogController = ({
  open,
  onClose,
}: CatalogCategoriesDialogProps): CatalogCategoriesDialogViewModel => {
  const categories = useCatalogStore((state) => state.categories)
  const products = useCatalogStore((state) => state.products)
  const addCategory = useCatalogStore((state) => state.addCategory)
  const updateCategory = useCatalogStore((state) => state.updateCategory)
  const deleteCategory = useCatalogStore((state) => state.deleteCategory)

  const [newName, setNewName] = useState('')
  const [newPrefix, setNewPrefix] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingPrefix, setEditingPrefix] = useState('')

  const rows = categories.map((category: CatalogCategoryConfig) => ({
    id: category.id,
    name: category.name,
    prefix: category.prefix,
    activeProductCount: products.filter(
      (product) => productUsesCatalogCategory(product, category.name) && product.isActive,
    ).length,
    inactiveProductCount: products.filter(
      (product) => productUsesCatalogCategory(product, category.name) && !product.isActive,
    ).length,
    inactivePrimaryProductCount: products.filter(
      (product) => product.category === category.name && !product.isActive,
    ).length,
    isProtected: category.name === 'Uncategorized',
  }))

  const cancelEditing = () => {
    setEditingId(null)
    setEditingName('')
    setEditingPrefix('')
  }

  return {
    open,
    onClose,
    rows,
    newName,
    newPrefix,
    editingId,
    editingName,
    editingPrefix,
    onNewNameChange: setNewName,
    onNewPrefixChange: (value) => setNewPrefix(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)),
    onEditingNameChange: setEditingName,
    onEditingPrefixChange: (value) => setEditingPrefix(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)),
    onAdd: () => {
      const result = addCategory(newName, newPrefix || undefined)
      if (!result.ok) {
        toast({ description: result.reason })
        return
      }
      setNewName('')
      setNewPrefix('')
    },
    onStartEditing: (id, currentName, currentPrefix) => {
      setEditingId(id)
      setEditingName(currentName)
      setEditingPrefix(currentPrefix)
    },
    onCancelEditing: cancelEditing,
    onCommitEditing: () => {
      if (!editingId) return
      const result = updateCategory(editingId, {
        name: editingName,
        prefix: editingPrefix,
      })
      if (!result.ok) {
        toast({ description: result.reason })
        return
      }
      cancelEditing()
    },
    onDelete: async (row) => {
      if (row.activeProductCount > 0 || row.isProtected) return
      const inactiveCopy = row.inactiveProductCount > 0
        ? ` ${row.inactiveProductCount} inactive product${row.inactiveProductCount === 1 ? '' : 's'} will have this occasion removed.${row.inactivePrimaryProductCount > 0 ? ` ${row.inactivePrimaryProductCount} whose main occasion is removed will move to Uncategorized.` : ''}`
        : ''
      const confirmed = await requestAppConfirmation({
        title: `Remove “${row.name}”?`,
        description: `No active products use this occasion.${inactiveCopy}`,
        confirmLabel: 'Remove occasion',
        destructive: true,
      })
      if (!confirmed) return
      const result = deleteCategory(row.id)
      if (!result.ok) {
        toast({ description: result.reason })
        return
      }
      toast({ description: `Removed occasion “${row.name}”.` })
    },
  }
}
