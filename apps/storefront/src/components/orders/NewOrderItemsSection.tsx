import type { FC } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'

interface NewOrderItemsSectionProps {
  viewModel: NewOrderSheetViewModel
  fieldClass: (isActive: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderItemsSection: FC<NewOrderItemsSectionProps> = ({
  viewModel,
  fieldClass,
  sectionClass,
}) => {
  const {
    values,
    errors,
    catalogProductOptions,
    activeGuideField,
    activeGuideSection,
    onFieldChange,
    onCurrencyFieldChange,
    onOrderItemModeChange,
    onCatalogProductChange,
    onSectionFocus,
  } = viewModel

  return (
    <>
              {/* Order Items — the hero card: primary-tinted, larger
                  emphasis, so it visually outranks Customer above it. */}
              <section
                onFocus={() => onSectionFocus('items')}
                className={sectionClass(
                  activeGuideSection === 'items',
                  'border-b border-border/70 bg-transparent px-0 pb-4 pt-4 sm:rounded-lg sm:border-0 sm:bg-card sm:px-3 sm:py-3',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-5 text-foreground">
                    Order items<span className="text-destructive">*</span>
                  </h3>
                  <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => onOrderItemModeChange('catalog')}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        values.orderItemMode === 'catalog'
                          ? 'bg-primary text-primary-foreground shadow-ios-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => onOrderItemModeChange('custom')}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        values.orderItemMode === 'custom'
                          ? 'bg-primary text-primary-foreground shadow-ios-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                    {values.orderItemMode === 'catalog' ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="orderItemCatalogId"
                          className="text-xs text-muted-foreground"
                        >
                          Choose a product from catalog
                        </label>
                        <Select
                          value={values.orderItemCatalogId}
                          onValueChange={onCatalogProductChange}
                        >
                          <SelectTrigger
                            id="orderItemCatalogId"
                            className={fieldClass(activeGuideField === 'orderItemCatalogId')}
                          >
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                          {catalogProductOptions.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.label}
                            </SelectItem>
                          ))}
                          </SelectContent>
                        </Select>
                        {errors.orderItemCatalogId && (
                          <p className="text-xs text-destructive">
                            {errors.orderItemCatalogId}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="orderItemCustomName"
                            className="text-xs text-muted-foreground"
                          >
                            Item name
                          </label>
                          <input
                            id="orderItemCustomName"
                            type="text"
                            value={values.orderItemCustomName}
                            onChange={onFieldChange('orderItemCustomName')}
                            className={fieldClass(activeGuideField === 'orderItemCustomName')}
                            placeholder="e.g. Custom bouquet for anniversary"
                          />
                          {errors.orderItemCustomName && (
                            <p className="text-xs text-destructive">
                              {errors.orderItemCustomName}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="orderItemCustomPrice"
                            className="text-xs text-muted-foreground"
                          >
                            Price (IDR)
                          </label>
                          <input
                            id="orderItemCustomPrice"
                            type="text"
                            inputMode="numeric"
                            value={values.orderItemCustomPrice}
                            onChange={(event) =>
                              onCurrencyFieldChange(
                                'orderItemCustomPrice',
                                event.target.value,
                              )
                            }
                            className={fieldClass(activeGuideField === 'orderItemCustomPrice')}
                            placeholder="e.g. 350000"
                          />
                          {errors.orderItemCustomPrice && (
                            <p className="text-xs text-destructive">
                              {errors.orderItemCustomPrice}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
              </section>
    </>
  )
}
