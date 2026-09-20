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
    catalogVariantOptions,
    activeGuideField,
    activeGuideSection,
    onFieldChange,
    onCurrencyFieldChange,
    onOrderItemModeChange,
    onCatalogProductChange,
    onCatalogVariantChange,
    onSectionFocus,
  } = viewModel

  return (
    <>
              {/* Order Items — the hero: larger emphasis, so it visually
                  outranks Customer above it. Flat on the card. */}
              <section
                onFocus={() => onSectionFocus('items')}
                className={sectionClass(
                  activeGuideSection === 'items',
                  'bg-transparent px-0 py-1 sm:px-1',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-5 text-foreground">
                    Order items<span className="text-destructive">*</span>
                  </h3>
                  <div className="inline-flex rounded-full border border-border bg-surface-panel p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => onOrderItemModeChange('catalog')}
                      className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-xs font-medium transition cursor-pointer ${
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
                      className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-xs font-medium transition cursor-pointer ${
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
                            aria-invalid={Boolean(errors.orderItemCatalogId)}
                            aria-describedby={errors.orderItemCatalogId ? 'orderItemCatalogId-error' : undefined}
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
                          <p id="orderItemCatalogId-error" className="text-xs text-destructive" role="alert">
                            {errors.orderItemCatalogId}
                          </p>
                        )}
                        {values.orderItemCatalogId && catalogVariantOptions.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <label htmlFor="orderItemVariantId" className="text-xs text-muted-foreground">
                              Choose size or variant
                            </label>
                            <Select value={values.orderItemVariantId} onValueChange={onCatalogVariantChange}>
                              <SelectTrigger
                                id="orderItemVariantId"
                                className={fieldClass(activeGuideField === 'orderItemVariantId')}
                                aria-invalid={Boolean(errors.orderItemVariantId)}
                                aria-describedby={errors.orderItemVariantId ? 'orderItemVariantId-error' : undefined}
                              >
                                <SelectValue placeholder="Select size or variant" />
                              </SelectTrigger>
                              <SelectContent>
                                {catalogVariantOptions.map((variant) => (
                                  <SelectItem key={variant.id} value={variant.id}>{variant.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {errors.orderItemVariantId && <p id="orderItemVariantId-error" className="text-xs text-destructive" role="alert">{errors.orderItemVariantId}</p>}
                          </div>
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
                            enterKeyHint="next"
                            value={values.orderItemCustomName}
                            onChange={onFieldChange('orderItemCustomName')}
                            className={fieldClass(activeGuideField === 'orderItemCustomName')}
                            placeholder="e.g. Custom bouquet for anniversary"
                            aria-invalid={Boolean(errors.orderItemCustomName)}
                            aria-describedby={errors.orderItemCustomName ? 'orderItemCustomName-error' : undefined}
                          />
                          {errors.orderItemCustomName && (
                            <p id="orderItemCustomName-error" className="text-xs text-destructive" role="alert">
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
                            enterKeyHint="next"
                            value={values.orderItemCustomPrice}
                            onChange={(event) =>
                              onCurrencyFieldChange(
                                'orderItemCustomPrice',
                                event.target.value,
                              )
                            }
                            className={fieldClass(activeGuideField === 'orderItemCustomPrice')}
                            placeholder="e.g. 350000"
                            aria-invalid={Boolean(errors.orderItemCustomPrice)}
                            aria-describedby={errors.orderItemCustomPrice ? 'orderItemCustomPrice-error' : undefined}
                          />
                          {errors.orderItemCustomPrice && (
                            <p id="orderItemCustomPrice-error" className="text-xs text-destructive" role="alert">
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
