/**
 * @file Storefront.tsx
 * @description Public customer-facing online store. The poster homepage and
 * the product shop share one cart/checkout state so navigation never loses
 * the customer's selections.
 */

import type { FC } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCatalogStore } from "../store/catalogStore";
import { useSettingsStore } from "../store/settingsStore";
import {
  filterCatalogProducts,
  getAvailableCategories,
  getAvailableSubCategories,
  getDisplayPriceIdr,
  type CatalogCategoryFilter,
  type CatalogSubCategoryFilter,
} from "../domain/catalogDomain";
import { StorefrontShopFilters } from "../components/storefront/StorefrontShopFilters";
import { StorefrontCategoryHero } from "../components/storefront/StorefrontCategoryHero";
import type { CartLine } from "../components/storefront/CartDrawer";
import { CartDrawerContainer } from "../components/storefront/CartDrawerContainer";
import { StorefrontHeader } from "../components/storefront/StorefrontHeader";
import { StorefrontNavigationDrawer } from "../components/storefront/StorefrontNavigationDrawer";
import { StorefrontSearchPanel } from "../components/storefront/StorefrontSearchPanel";
import { StorefrontFooter } from "../components/storefront/StorefrontFooter";
import { StorefrontProductGrid, StorefrontProductRail } from "../components/storefront/StorefrontProductCollections";
import { StorefrontMiniCart } from "../components/storefront/StorefrontMiniCart";
import { StorefrontContainer } from "../components/storefront/StorefrontContainer";
import type { CatalogVariant } from "../store/catalogStoreTypes";
import { toast } from "../hooks/use-toast";
import { useScrollThresholdCartBar } from "../hooks/useScrollThresholdCartBar";
import { useElementInViewport } from "../hooks/useElementInViewport";
import { StorefrontHome } from "./StorefrontHome";
import { StorefrontProductDetailPage } from "./StorefrontProductDetailPage";
import { StorefrontCategoriesPage } from "./StorefrontCategoriesPage";

const currencyFormatter = new Intl.NumberFormat("id-ID");

type StorefrontRoute = "home" | "categories" | "shop" | "product";

const readProductIdFromPath = (): string | null => {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "");
  const match = normalizedPath.match(/\/shop\/product\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const readRoute = (): StorefrontRoute => {
  if (readProductIdFromPath()) return "product";
  const normalizedPath = window.location.pathname.replace(/\/+$/, "");
  if (normalizedPath.endsWith("/categories")) return "categories";
  return normalizedPath.endsWith("/shop") ? "shop" : "home";
};

const readRequestedOccasion = (): string | null =>
  new URLSearchParams(window.location.search).get("occasion");
const readRequestedArrangement = (): string | null =>
  new URLSearchParams(window.location.search).get("arrangement");
const readRequestedCollection = (): string | null =>
  new URLSearchParams(window.location.search).get("collection");

const buildProductUrl = (productId: string): string =>
  `/shop/product/${encodeURIComponent(productId)}`;

const buildShopUrl = (
  occasion: CatalogCategoryFilter = "all",
  arrangement = "all",
  collection = "all",
): string => {
  const params = new URLSearchParams();
  if (occasion !== "all") params.set("occasion", occasion);
  if (arrangement !== "all") params.set("arrangement", arrangement);
  if (collection !== "all") params.set("collection", collection);
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
};

export const StorefrontPage: FC = () => {
  const products = useCatalogStore((state) => state.products);
  const categories = useCatalogStore((state) => state.categories);
  const storeProfile = useSettingsStore((state) => state.storeProfile);

  const categoryNames = useMemo(
    () => categories.map((category) => category.name),
    [categories],
  );

  const [route, setRoute] = useState<StorefrontRoute>(() => readRoute());
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategoryFilter>(
    () => {
      const requestedOccasion = readRequestedOccasion();
      return requestedOccasion && categoryNames.includes(requestedOccasion)
        ? requestedOccasion
        : "all";
    },
  );
  const [subCategoryFilter, setSubCategoryFilter] =
    useState<CatalogSubCategoryFilter>("all");
  const [arrangementFilter, setArrangementFilter] = useState<string>(() => readRequestedArrangement() ?? "all");
  const [collectionFilter, setCollectionFilter] = useState<string>(() => readRequestedCollection() ?? "all");
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    () => readProductIdFromPath(),
  );
  const [shopScrollY, setShopScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const shopFooterRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.productId === selectedProductId) ??
      null,
    [products, selectedProductId],
  );

  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    const selectedOccasions = selectedProduct.occasionTags ?? [];
    return products
      .filter(
        (product) =>
          product.id !== selectedProduct.id &&
          product.isActive &&
          (product.occasionTags ?? []).some((occasion) =>
            selectedOccasions.includes(occasion),
          ),
      )
      .slice(0, 4);
  }, [products, selectedProduct]);

  const availableCategories = useMemo(
    () => getAvailableCategories(products, categoryNames),
    [products, categoryNames],
  );
  const availableSubCategories = useMemo(
    () => getAvailableSubCategories(products, categoryFilter),
    [products, categoryFilter],
  );
  const filteredProducts = useMemo(() => {
    const base = filterCatalogProducts(products, {
      category: categoryFilter,
      subCategory: subCategoryFilter,
      query,
    });
    return base.filter((product) => {
      if (arrangementFilter !== "all" && product.productType !== arrangementFilter) return false;
      if (collectionFilter !== "all" && product.collectionSeries !== collectionFilter) return false;
      return true;
    });
  }, [products, categoryFilter, subCategoryFilter, arrangementFilter, collectionFilter, query]);

  const featuredProducts = useMemo(() => {
    const markedFeatured = filteredProducts.filter((product) => product.isFeatured);
    return (markedFeatured.length > 0 ? markedFeatured : filteredProducts).slice(0, 6);
  }, [filteredProducts]);

  const regularProducts = useMemo(() => {
    const featuredIds = new Set(featuredProducts.map((product) => product.id));
    return filteredProducts.filter((product) => !featuredIds.has(product.id));
  }, [filteredProducts, featuredProducts]);

  const searchResultCount = useMemo(
    () =>
      filterCatalogProducts(products, {
        category: "all",
        subCategory: "all",
        query: searchDraft,
      }).length,
    [products, searchDraft],
  );

  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotalIdr = cartLines.reduce(
    (sum, line) => sum + line.unitPriceIdr * line.quantity,
    0,
  );
  const shopFooterInViewport = useElementInViewport({
    enabled: route === "shop" && cartCount > 0,
    targetRef: shopFooterRef,
  });
  const shopCartBarVisible = useScrollThresholdCartBar({
    enabled: route === "shop" && cartCount > 0,
    resetKey: route,
    revealThresholdVh: 0.25,
    blocked: shopFooterInViewport,
    revealKey: cartCount,
  });

  const navigateHome = useCallback(() => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    window.history.pushState({}, "", "/");
    setRoute("home");
    setSelectedProductId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigateCategories = useCallback(() => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    setSelectedProductId(null);
    window.history.pushState({}, "", "/categories");
    setRoute("categories");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigateShopByArrangement = useCallback((arrangement: string) => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    setCategoryFilter("all");
    setSubCategoryFilter("all");
    setArrangementFilter(arrangement);
    setCollectionFilter("all");
    setQuery("");
    setSelectedProductId(null);
    window.history.pushState({}, "", buildShopUrl("all", arrangement, "all"));
    setRoute("shop");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigateShopByCollection = useCallback((collection: string) => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    setCategoryFilter("all");
    setSubCategoryFilter("all");
    setArrangementFilter("all");
    setCollectionFilter(collection);
    setQuery("");
    setSelectedProductId(null);
    window.history.pushState({}, "", buildShopUrl("all", "all", collection));
    setRoute("shop");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigateShop = useCallback(
    (category: CatalogCategoryFilter = "all") => {
      setIsMenuOpen(false);
      setIsSearchOpen(false);
      setCategoryFilter(category);
      setSubCategoryFilter("all");
      setArrangementFilter("all");
      setCollectionFilter("all");
      setQuery("");
      setSelectedProductId(null);
      window.history.pushState({}, "", buildShopUrl(category, "all", "all"));
      setRoute("shop");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [],
  );

  const handleOpenCart = useCallback(() => {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    setIsCartOpen(true);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsMenuOpen(false);
    setSearchDraft(route === "shop" ? query : "");
    setIsSearchOpen(true);
  }, [query, route]);

  const handleToggleMenu = useCallback(() => {
    setIsSearchOpen(false);
    setIsMenuOpen((open) => !open);
  }, []);

  const handleSearchDraftChange = useCallback((value: string) => {
    setSearchDraft(value);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    const nextQuery = searchDraft.trim();
    setCategoryFilter("all");
    setSubCategoryFilter("all");
    setArrangementFilter("all");
    setCollectionFilter("all");
    setQuery(nextQuery);
    setSelectedProductId(null);
    setIsSearchOpen(false);
    window.history.pushState(
      {
        storefrontShop: {
          query: nextQuery,
          categoryFilter: "all",
          subCategoryFilter: "all",
          scrollY: 0,
        },
      },
      "",
      "/shop",
    );
    setRoute("shop");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [searchDraft]);

  const navigateProduct = useCallback(
    (catalogProductId: string) => {
      const product = products.find((item) => item.id === catalogProductId);
      if (!product) return;

      const scrollY = window.scrollY;
      setShopScrollY(scrollY);
      window.history.replaceState(
        {
          ...(window.history.state ?? {}),
          storefrontShop: { query, categoryFilter, subCategoryFilter, scrollY },
        },
        "",
        window.location.href,
      );
      window.history.pushState({}, "", buildProductUrl(product.productId));
      setSelectedProductId(product.productId);
      setRoute("product");
      window.scrollTo({ top: 0 });
    },
    [categoryFilter, products, query, subCategoryFilter],
  );

  const navigateBackToShop = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigateShop(categoryFilter);
  }, [categoryFilter, navigateShop]);


  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setIsMenuOpen(false);
      setIsSearchOpen(false);
      const nextRoute = readRoute();
      setRoute(nextRoute);

      if (nextRoute === "product") {
        setSelectedProductId(readProductIdFromPath());
        window.scrollTo({ top: 0 });
        return;
      }

      setSelectedProductId(null);
      if (nextRoute === "shop") {
        const savedContext = event.state?.storefrontShop as
          | {
              query?: string;
              categoryFilter?: CatalogCategoryFilter;
              subCategoryFilter?: CatalogSubCategoryFilter;
              scrollY?: number;
            }
          | undefined;
        const requestedOccasion = readRequestedOccasion();
        const requestedArrangement = readRequestedArrangement();
        const requestedCollection = readRequestedCollection();
        const restoredCategory =
          savedContext?.categoryFilter &&
          availableCategories.includes(savedContext.categoryFilter)
            ? savedContext.categoryFilter
            : requestedOccasion &&
                availableCategories.includes(requestedOccasion)
              ? requestedOccasion
              : "all";

        setCategoryFilter(restoredCategory);
        setSubCategoryFilter(savedContext?.subCategoryFilter ?? "all");
        setArrangementFilter(requestedArrangement ?? "all");
        setCollectionFilter(requestedCollection ?? "all");
        setQuery(savedContext?.query ?? "");
        const targetScroll = savedContext?.scrollY ?? shopScrollY;
        window.requestAnimationFrame(() =>
          window.scrollTo({ top: targetScroll }),
        );
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [availableCategories, shopScrollY]);

  useEffect(() => {
    if (!isMenuOpen && !isSearchOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      setIsSearchOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, isSearchOpen]);

  const handleAddToCart = (
    productId: string,
    quantity = 1,
    variant?: CatalogVariant,
  ) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    const lineId = variant ? `${productId}__${variant.id}` : productId;
    const unitPriceIdr = variant?.price ?? getDisplayPriceIdr(product);
    const name = variant ? `${product.name} (${variant.size})` : product.name;

    setCartLines((previous) => {
      const existing = previous.find((line) => line.lineId === lineId);
      if (existing) {
        return previous.map((line) =>
          line.lineId === lineId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [
        ...previous,
        {
          lineId,
          productId,
          variantId: variant?.id,
          name,
          unitPriceIdr,
          quantity,
        },
      ];
    });
    setLastOrderNumber(null);
    if (!isCartOpen) {
      toast({ description: `Added ${name} to cart.` });
    }
  };

  const handleLineQuantityChange = (lineId: string, delta: number) => {
    setCartLines((previous) =>
      previous
        .map((line) =>
          line.lineId === lineId
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const handleOrderPlaced = (orderNumber: string) => {
    setCartLines([]);
    setLastOrderNumber(orderNumber);
  };

  return (
    <div
      className={`storefront-font min-h-screen ${
        route === "categories" || route === "product" ? "storefront-font--footer-bleed" : ""
      }`}
      data-no-translate
    >
      {route === "home" ? (
        <StorefrontHome
          cartCount={cartCount}
          onOpenCart={handleOpenCart}
          onOpenCategories={navigateCategories}
          onOpenHome={navigateHome}
          onOpenSearch={handleOpenSearch}
          onToggleMenu={handleToggleMenu}
          menuOpen={isMenuOpen}
        />
      ) : route === "categories" ? (
        <StorefrontCategoriesPage
          products={products}
          occasionNames={categoryNames}
          cartCount={cartCount}
          storeProfile={storeProfile}
          onOpenCart={handleOpenCart}
          onOpenHome={navigateHome}
          onOpenSearch={handleOpenSearch}
          onToggleMenu={handleToggleMenu}
          menuOpen={isMenuOpen}
          onSelectOccasion={(occasion) => navigateShop(occasion)}
          onSelectArrangement={navigateShopByArrangement}
          onSelectCollection={navigateShopByCollection}
        />
      ) : route === "product" ? (
        selectedProduct ? (
          <StorefrontProductDetailPage
            key={selectedProduct.id}
            product={selectedProduct}
            relatedProducts={relatedProducts}
            cartCount={cartCount}
            cartTotalIdr={cartTotalIdr}
            cartOpen={isCartOpen}
            formatter={currencyFormatter}
            storeProfile={storeProfile}
            onBack={navigateBackToShop}
            onOpenHome={navigateHome}
            onOpenCart={handleOpenCart}
            onOpenSearch={handleOpenSearch}
            onToggleMenu={handleToggleMenu}
            menuOpen={isMenuOpen}
            onOpenProduct={navigateProduct}
            onAddToCart={handleAddToCart}
          />
        ) : (
          <div className="flex min-h-screen flex-col bg-[var(--sf-cream)] text-black">
            <StorefrontHeader
              cartCount={cartCount}
              onOpenCart={handleOpenCart}
              onOpenHome={navigateHome}
              onOpenSearch={handleOpenSearch}
              onToggleMenu={handleToggleMenu}
              menuOpen={isMenuOpen}
            />
            <StorefrontContainer className="flex flex-1 items-center justify-center py-16 text-center"><main className="w-full max-w-3xl">
              <div className="space-y-6">
                <p className="sf-label text-black/45">Product unavailable</p>
                <h1 className="sf-page-title font-display">Product not found</h1>
                <p className="mx-auto max-w-md sf-body text-black/58">This product may have been removed or is no longer available.</p>
                <button
                  type="button"
                  onClick={() => navigateShop("all")}
                  className="sf-primary-action inline-flex items-center justify-center bg-black text-[#fdf6ee] hover:bg-black/85"
                >
                  Back to shop
                </button>
              </div>
            </main></StorefrontContainer>
          </div>
        )
      ) : (
        <div className="storefront-shop-page min-h-screen bg-[var(--sf-cream)] text-black">
          <StorefrontHeader
            cartCount={cartCount}
            onOpenCart={handleOpenCart}
            onOpenHome={navigateHome}
            onOpenSearch={handleOpenSearch}
            onToggleMenu={handleToggleMenu}
            menuOpen={isMenuOpen}
          />

          <StorefrontContainer className="space-y-7 pb-0 pt-0 sm:space-y-9 lg:space-y-9 lg:pb-0 lg:pt-5">
            {lastOrderNumber && (
              <div className="rounded-[var(--sf-radius-card)] bg-[#eee4cc] px-4 py-3.5 sf-support text-black">
                Order <span className="font-medium">{lastOrderNumber}</span>{" "}
                placed! Your order was received and is waiting for staff
                verification.
              </div>
            )}

            <StorefrontCategoryHero
              categoryLabel={
                collectionFilter !== "all"
                  ? collectionFilter
                  : arrangementFilter !== "all"
                    ? arrangementFilter
                    : categoryFilter !== "all"
                      ? categoryFilter
                      : "General Gifting"
              }
            />

            <StorefrontShopFilters
              activeCategoryLabel={
                collectionFilter !== "all"
                  ? collectionFilter
                  : arrangementFilter !== "all"
                    ? arrangementFilter
                    : categoryFilter !== "all"
                      ? categoryFilter
                      : "All categories"
              }
              onOpenCategories={navigateCategories}
              subCategoryFilter={subCategoryFilter}
              onSubCategoryFilterChange={setSubCategoryFilter}
              availableSubCategories={availableSubCategories}
            />

            {featuredProducts.length > 0 && (
              <StorefrontProductRail
                key={`featured-${categoryFilter}-${subCategoryFilter}-${arrangementFilter}-${collectionFilter}-${query}`}
                title="Featured Products"
                products={featuredProducts}
                formatter={currencyFormatter}
                onOpen={navigateProduct}
              />
            )}

            <StorefrontProductGrid
              key={`${categoryFilter}-${subCategoryFilter}-${arrangementFilter}-${collectionFilter}-${query}`}
              title={featuredProducts.length > 0 ? "All Products" : undefined}
              products={regularProducts.length > 0 ? regularProducts : filteredProducts}
              formatter={currencyFormatter}
              onOpen={navigateProduct}
            />

            <div ref={shopFooterRef}>
              <StorefrontFooter storeProfile={storeProfile} />
            </div>
          </StorefrontContainer>
        </div>
      )}

      <StorefrontSearchPanel
        open={isSearchOpen}
        value={searchDraft}
        resultCount={searchResultCount}
        onChange={handleSearchDraftChange}
        onSubmit={handleSearchSubmit}
        onClose={() => setIsSearchOpen(false)}
      />

      <StorefrontNavigationDrawer
        open={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpenCategories={navigateCategories}
        onOpenAllFlowers={() => navigateShop("all")}
        onOpenCollection={navigateShopByCollection}
      />

      {route === "shop" &&
        cartCount > 0 &&
        !isCartOpen &&
        (
          <StorefrontMiniCart
            count={cartCount}
            totalIdr={cartTotalIdr}
            formatter={currencyFormatter}
            onOpen={handleOpenCart}
            concealed={!shopCartBarVisible}
            suppressUnderlay={isMenuOpen}
          />
        )}

      <CartDrawerContainer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        lines={cartLines}
        onIncrement={(lineId) => handleLineQuantityChange(lineId, 1)}
        onDecrement={(lineId) => handleLineQuantityChange(lineId, -1)}
        onOrderPlaced={handleOrderPlaced}
        formatter={currencyFormatter}
      />
    </div>
  );
};

export default StorefrontPage;
