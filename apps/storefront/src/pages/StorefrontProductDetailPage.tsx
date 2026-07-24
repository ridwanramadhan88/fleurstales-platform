/**
 * @file StorefrontProductDetailPage.tsx
 * @description Dedicated customer-facing product page. This presentation
 * reuses the existing catalog data and cart shell without changing product,
 * pricing, checkout, or order logic.
 */

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { CatalogProduct, CatalogVariant } from "../store/catalogStoreTypes";
import type { StoreProfileSettings } from "../types/settings";
import { CartBagIcon, CartCountBadge } from "../components/storefront/StorefrontCartIcon";
import { StorefrontProductCard } from "../components/storefront/StorefrontProductCard";
import { StorefrontMiniCart } from "../components/storefront/StorefrontMiniCart";
import { StorefrontHeader } from "../components/storefront/StorefrontHeader";
import { StorefrontContainer } from "../components/storefront/StorefrontContainer";
import { StorefrontFooter } from "../components/storefront/StorefrontFooter";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../components/ui/dialog";
import { getStorefrontProductGallery } from "../components/storefront/storefrontProductImages";
import { getPromoPercentLabel } from "../domain/catalogDomain";
import { useScrollThresholdCartBar } from "../hooks/useScrollThresholdCartBar";
import { useCatalogStore } from "../store/catalogStore";
import { resolveCatalogSizeGuide } from "../store/catalogStoreSizeGuideActions";

interface Props {
  product: CatalogProduct;
  relatedProducts: CatalogProduct[];
  cartCount: number;
  cartTotalIdr: number;
  cartOpen: boolean;
  formatter: Intl.NumberFormat;
  storeProfile: StoreProfileSettings;
  onBack: () => void;
  onOpenHome: () => void;
  onOpenCart: () => void;
  onOpenSearch: () => void;
  onToggleMenu: () => void;
  menuOpen: boolean;
  onOpenProduct: (productId: string) => void;
  onAddToCart: (
    productId: string,
    quantity?: number,
    variant?: CatalogVariant,
  ) => void;
}

const getProductImages = (product: CatalogProduct): string[] =>
  getStorefrontProductGallery(product);

const getActiveVariants = (product: CatalogProduct): CatalogVariant[] =>
  product.variants.filter((variant) => variant.status === "active");

const GalleryArrow: FC<{ direction: "previous" | "next" }> = ({ direction }) => (
  <svg viewBox="0 0 28 44" className="h-auto w-5 sm:w-6" fill="none" aria-hidden="true">
    <path
      d={direction === "previous" ? "M22 4 6 22l16 18" : "M6 4l16 18L6 40"}
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  </svg>
);

const DetailBackArrow: FC = () => (
  <svg
    viewBox="0 0 56 36"
    className="h-auto w-7 sm:w-8 lg:w-9"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M22 4 8 18l14 14M9 18h39"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  </svg>
);

export const StorefrontProductDetailPage: FC<Props> = ({
  product,
  relatedProducts,
  cartCount,
  cartTotalIdr,
  cartOpen,
  formatter,
  storeProfile,
  onBack,
  onOpenHome,
  onOpenCart,
  onOpenSearch,
  onToggleMenu,
  menuOpen,
  onOpenProduct,
  onAddToCart,
}) => {
  const sizeGuideTemplates = useCatalogStore((state) => state.sizeGuideTemplates);
  const sizeGuideTargets = useCatalogStore((state) => state.sizeGuideTargets);
  const images = useMemo(() => getProductImages(product), [product]);
  const activeVariants = useMemo(() => getActiveVariants(product), [product]);
  const [activeImage, setActiveImage] = useState(images[0] ?? null);
  const [selectedVariantId, setSelectedVariantId] = useState(
    activeVariants.length === 1 ? activeVariants[0]?.id ?? "" : "",
  );
  const [quantity, setQuantity] = useState(1);
  const [sizingInfoOpen, setSizingInfoOpen] = useState(false);
  const [galleryDirection, setGalleryDirection] = useState<"previous" | "next">("next");
  const touchStartX = useRef<number | null>(null);
  const priceSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedVariant = activeVariants.find((variant) => variant.id === selectedVariantId);
  const lowestActivePriceIdr = activeVariants.reduce(
    (lowest, variant) => Math.min(lowest, variant.price),
    Number.POSITIVE_INFINITY,
  );
  const displayUnitPriceIdr = selectedVariant?.price ?? (
    Number.isFinite(lowestActivePriceIdr) ? lowestActivePriceIdr : 0
  );
  const totalPriceIdr = displayUnitPriceIdr * quantity;
  const promoPercentLabel = getPromoPercentLabel(product, displayUnitPriceIdr);
  const requiresSizeSelection = activeVariants.length > 1;
  const canPurchase = product.isActive && Boolean(selectedVariant) && activeVariants.length > 0;
  const activeImageIndex = activeImage ? Math.max(0, images.indexOf(activeImage)) : 0;
  const mobileCartBarVisible = useScrollThresholdCartBar({
    enabled: cartCount > 0,
    resetKey: product.id,
    revealThresholdVh: 0.5,
    revealKey: cartCount,
  });
  const desktopCartBarPersistent =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 1024px)").matches;
  const productDetailsAlwaysOpen =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 640px)").matches;
  const sizeGuide = useMemo(
    () => resolveCatalogSizeGuide(product, sizeGuideTemplates, sizeGuideTargets),
    [product, sizeGuideTargets, sizeGuideTemplates],
  );

  useEffect(() => {
    setActiveImage(images[0] ?? null);
    setGalleryDirection("next");
    setSelectedVariantId(activeVariants.length === 1 ? activeVariants[0]?.id ?? "" : "");
    setQuantity(1);
    window.scrollTo({ top: 0 });
  }, [activeVariants, images, product.productId, product.variants]);

  const showGalleryImage = (index: number, direction: "previous" | "next") => {
    if (images.length === 0) return;
    const normalizedIndex = (index + images.length) % images.length;
    setGalleryDirection(direction);
    setActiveImage(images[normalizedIndex]);
  };

  const showPreviousImage = () => showGalleryImage(activeImageIndex - 1, "previous");
  const showNextImage = () => showGalleryImage(activeImageIndex + 1, "next");

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) showPreviousImage();
    else showNextImage();
  };

  const addSelectedToCart = () => {
    if (!selectedVariant || !canPurchase) return;
    onAddToCart(product.id, quantity, selectedVariant);
  };

  return (
    <div className="storefront-product-detail-page min-h-screen bg-[var(--sf-cream)] text-black">
      <div className="hidden md:block">
        <StorefrontHeader
          cartCount={cartCount}
          onOpenCart={onOpenCart}
          onOpenHome={onOpenHome}
          onOpenSearch={onOpenSearch}
          onToggleMenu={onToggleMenu}
          menuOpen={menuOpen}
          onBack={onBack}
          backLabel="Back"
        />
      </div>
      <main>
        <div className="storefront-product-detail-layout lg:mx-auto lg:grid lg:max-w-[1320px] lg:grid-cols-[minmax(0,620px)_minmax(380px,1fr)] lg:items-start lg:gap-16 lg:px-12 lg:pt-10 xl:gap-20 xl:px-14">
          <section
            aria-label={`${product.name} images`}
            className="storefront-product-detail-gallery relative min-w-0 overflow-hidden bg-[#606060] [clip-path:polygon(0_0,100%_0,100%_98.65%,76.6%_100%,35%_96.9%,0_98.7%)] lg:aspect-[4/5] lg:w-full"
          >
            <div className="relative aspect-[4/5] w-full touch-pan-y lg:absolute lg:inset-0 lg:aspect-auto" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              {activeImage ? (
                <img
                  key={`${activeImage}-${galleryDirection}`}
                  src={activeImage}
                  alt={`${product.name} — image ${activeImageIndex + 1}`}
                  className={`storefront-gallery-image storefront-gallery-image--${galleryDirection} absolute inset-0 h-full w-full object-cover object-center`}
                />
              ) : (
                <div className="absolute inset-0 bg-[#606060]" aria-label="Product image unavailable" />
              )}

              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-7 sm:pt-7 md:hidden">
                <button
                  type="button"
                  onClick={onBack}
                  className="tap-scale inline-flex size-11 items-center justify-center text-[#fdf6ef] transition hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf6ef]/70 lg:size-12"
                  aria-label="Back to shop"
                >
                  <DetailBackArrow />
                </button>

                <button
                  type="button"
                  onClick={onOpenCart}
                  className="tap-scale relative inline-flex size-11 items-center justify-center transition hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf6ef]/70 lg:size-12"
                  aria-label={`Open cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
                >
                  <span
                    className={`storefront-cart-glyph ${
                      cartCount > 0 ? 'storefront-cart-glyph--cutout' : ''
                    } ${cartCount > 99 ? 'storefront-cart-glyph--cutout-wide' : ''}`.trim()}
                    aria-hidden="true"
                  >
                    <CartBagIcon tone="light" className="h-auto w-7 lg:w-[1.875rem]" />
                  </span>
                  <CartCountBadge count={cartCount} surface="dark" />
                </button>
              </div>

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPreviousImage}
                    className="absolute left-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center text-[#fdf6ef] transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf6ef]/70 sm:left-4"
                    aria-label="Previous product image"
                  >
                    <GalleryArrow direction="previous" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextImage}
                    className="absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center text-[#fdf6ef] transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf6ef]/70 sm:right-4"
                    aria-label="Next product image"
                  >
                    <GalleryArrow direction="next" />
                  </button>
                  <div
                  className="absolute inset-x-0 bottom-[5%] z-10 flex items-center justify-center"
                  aria-label="Product gallery images"
                >
                  {images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => showGalleryImage(index, index < activeImageIndex ? "previous" : "next")}
                      className={`storefront-gallery-dot ${
                        index === activeImageIndex ? "storefront-gallery-dot--active" : ""
                      }`}
                      aria-label={`View product image ${index + 1}`}
                      aria-pressed={index === activeImageIndex}
                    />
                  ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <StorefrontContainer className="lg:contents">
            <section className="storefront-product-detail-info space-y-6 px-0 pb-7 pt-8 sm:pt-10 lg:max-w-[31rem] lg:space-y-5 lg:px-0 lg:pb-0 lg:pt-1">
              <div className="space-y-4 lg:space-y-3">
                <div className="storefront-product-detail-tags flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full font-medium leading-none ${
                      product.material === "fresh"
                        ? "min-h-8 bg-[#00813f] px-3 py-1.5 sf-type-1 text-[#fdf6ef]"
                        : "min-h-9 bg-[#5c55c8] px-4 py-2 sf-type-2 text-[#fdf6ef]"
                    }`}
                  >
                    {product.material === "fresh" ? "Fresh flower" : "Artificial flower"}
                  </span>
                  {promoPercentLabel && (
                    <span className="inline-flex min-h-8 items-center rounded-full bg-[#f569a3] px-3 py-1.5 sf-type-1 font-bold leading-none text-black">
                      {promoPercentLabel}
                    </span>
                  )}
                </div>

                <div className="hidden">
                  <span className={`sf-label ${
                    product.material === "fresh" ? "text-[#00813f]" : "text-[#5c55c8]"
                  }`}>
                    {product.material === "fresh" ? "Fresh flower" : "Artificial flower"}
                  </span>
                  {promoPercentLabel && (
                    <>
                      <span className="size-1 rounded-full bg-black/18" aria-hidden="true" />
                      <span className="sf-label text-[#d93d7c]">{promoPercentLabel}</span>
                    </>
                  )}
                </div>

                <div ref={priceSectionRef} className="space-y-4 lg:space-y-3">
                  <p className="sf-label text-black/45">{product.category}</p>
                  <h1 className="sf-detail-title font-display max-w-[15ch] lg:text-[2rem] lg:leading-[1.03]">
                    {product.name}
                  </h1>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {product.originalPriceIdr && (
                      <span className="sf-type-2 text-black/42 line-through">{formatter.format(product.originalPriceIdr)}</span>
                    )}
                    <span className="sf-type-5 font-medium lg:text-[1.4rem]">
                      {!selectedVariant && requiresSizeSelection ? "From " : ""}{formatter.format(displayUnitPriceIdr)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="storefront-long-dash" aria-hidden="true" />

              {product.description && product.description.trim().length > 0 && (
                <section aria-labelledby="product-description-heading">
                  <h2 id="product-description-heading" className="sr-only">Description</h2>
                  <p className="sf-body max-w-[34rem] whitespace-pre-line text-black/68 lg:max-w-[31rem] lg:text-[0.9375rem] lg:leading-[1.55]">
                    {product.description}
                  </p>
                </section>
              )}

              <section className="space-y-4 lg:space-y-3" aria-labelledby="product-size-heading">
                <div className="flex items-end justify-between gap-4">
                  <h2 id="product-size-heading" className="sf-type-2 font-medium">Size</h2>
                  <div className="flex items-center gap-3">
                    {requiresSizeSelection && !selectedVariant && (
                      <p className="sf-type-1 font-medium text-[#d93d7c]">Select a size</p>
                    )}
                    {sizeGuide && (
                      <button
                        type="button"
                        onClick={() => setSizingInfoOpen(true)}
                        className="border-b border-black/45 pb-0.5 sf-type-1 font-medium text-black/62 transition hover:border-black hover:text-black"
                      >
                        Size guide
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-5">
                  {product.variants.map((variant) => {
                    const isActive = variant.status === "active";
                    const isSelected = variant.id === selectedVariant?.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={!isActive}
                        onClick={() => setSelectedVariantId(variant.id)}
                        className={`inline-flex min-h-12 min-w-12 items-center justify-center px-4 py-2.5 sf-type-3 font-medium leading-none transition [clip-path:polygon(2%_4%,98%_1%,96%_98%,1%_96%)] sm:min-h-[3.25rem] sm:min-w-[3.25rem] sm:px-5 lg:min-h-11 lg:min-w-11 lg:px-4 lg:text-base ${
                          isSelected
                            ? "bg-[#f569a3] text-[#fdf6ee]"
                            : isActive
                              ? "bg-transparent text-black hover:bg-black/[0.04]"
                              : "cursor-not-allowed text-black/25 line-through"
                        }`}
                        aria-pressed={isSelected}
                        aria-label={variant.size}
                      >
                        <span>{variant.size}</span>
                        {requiresSizeSelection && (
                          <span className={`ml-2 sf-type-1 ${isSelected ? "text-[#fdf6ee]/80" : "text-black/42"}`}>
                            {formatter.format(variant.price)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-4 lg:space-y-3" aria-labelledby="purchase-heading">
                <h2 id="purchase-heading" className="sr-only">Purchase options</h2>
                <div className="flex items-center justify-between gap-6">
                  <div className="inline-flex items-center rounded-full border border-black/15 p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      className="inline-flex size-11 items-center justify-center rounded-full hover:bg-black/5 disabled:opacity-30 lg:size-10"
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-4 lg:size-[18px]" />
                    </button>
                    <span className="min-w-10 text-center sf-type-3 font-medium sm:min-w-11" aria-label={`Quantity ${quantity}`}>{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => value + 1)}
                      className="inline-flex size-11 items-center justify-center rounded-full hover:bg-black/5 lg:size-10"
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-4 lg:size-[18px]" />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="sf-type-1 text-black/48">Total</p>
                    <p className="sf-type-5 font-medium lg:text-[1.45rem]">{formatter.format(totalPriceIdr)}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addSelectedToCart}
                  disabled={!canPurchase}
                  className="sf-primary-action inline-flex min-h-12 w-full items-center justify-center gap-3 text-[0.95rem] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(0,0,0,0.14)]"
                >
                  <CartBagIcon tone="light" className="h-auto w-6" />
                  {canPurchase ? "Add to cart" : requiresSizeSelection ? "Select a size" : "Unavailable"}
                </button>
              </section>

              <details
                open={productDetailsAlwaysOpen}
                className="group storefront-product-details lg:mt-2"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 sf-type-2 font-medium lg:min-h-12">
                  Product details
                  <span className="sf-type-3 font-normal leading-none text-black/42 transition group-open:rotate-45">+</span>
                </summary>
                <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 pb-2 pt-3 sf-type-2">
                  <dt className="text-black/45">Product ID</dt>
                  <dd className="text-right font-medium">{product.productId}</dd>
                  <dt className="text-black/45">Customization</dt>
                  <dd className="text-right font-medium">{product.isCustomizable ? "Available" : "Not available"}</dd>
                  <dt className="text-black/45">Availability</dt>
                  <dd className="text-right font-medium">{product.isActive ? "Available" : "Unavailable"}</dd>
                </dl>
              </details>
            </section>
          </StorefrontContainer>
        </div>

        <Dialog open={Boolean(sizeGuide) && sizingInfoOpen} onOpenChange={setSizingInfoOpen}>
          <DialogContent className="w-[min(92vw,30rem)] max-w-none gap-4 rounded-[1.5rem] bg-[var(--sf-cream)] p-5 sm:p-6">
            <DialogTitle className="pr-12 text-xl font-medium">{sizeGuide?.name ?? "Size guide"}</DialogTitle>
            {sizeGuide && (
              <div className="aspect-square w-full overflow-hidden rounded-[1.125rem] border border-black/10 bg-white">
                <img
                  src={sizeGuide.imageUrl}
                  alt={`${product.name} size guide`}
                  className="h-full w-full object-contain"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {relatedProducts.length > 0 && (
          <StorefrontContainer>
            <section className="mt-7 pt-1 sm:mt-12 lg:mt-24 lg:border-t lg:border-black/10 lg:pt-12" aria-labelledby="related-products-heading">
              <h2 id="related-products-heading" className="font-display sf-type-4 font-medium leading-none lg:text-[1.5rem]">
                You may also like
              </h2>
              <div className={`mt-4 grid grid-cols-2 gap-x-4 gap-y-10 sm:mt-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-12 lg:mt-8 lg:gap-x-8 lg:gap-y-14 xl:gap-x-9 ${relatedProducts.length === 1 ? "lg:grid-cols-[minmax(0,22rem)]" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
                {relatedProducts.map((relatedProduct) => (
                  <StorefrontProductCard
                    key={relatedProduct.id}
                    product={relatedProduct}
                    formatter={formatter}
                    onOpenDetail={() => onOpenProduct(relatedProduct.id)}
                    presentation="collection"
                  />
                ))}
              </div>
            </section>
          </StorefrontContainer>
        )}
        <div className="mt-12 sm:mt-16 lg:mt-24">
          <StorefrontFooter storeProfile={storeProfile} />
        </div>
      </main>

      {cartCount > 0 && !cartOpen && (
        <StorefrontMiniCart
          count={cartCount}
          totalIdr={cartTotalIdr}
          formatter={formatter}
          onOpen={onOpenCart}
          concealed={!desktopCartBarPersistent && !mobileCartBarVisible}
          suppressUnderlay={menuOpen}
        />
      )}
    </div>
  );
};

export default StorefrontProductDetailPage;
