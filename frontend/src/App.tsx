import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, Bike, CarFront, Check, ChevronDown, CircleHelp,
  Clock3, Eye, EyeOff, FileBarChart2, FileImage, Heart, Languages, LayoutGrid, Leaf, List, Menu, MessageCircle,
  LogOut, PackageSearch, Pencil, Plus, Recycle, RotateCw, Search, Send, Settings as SettingsIcon, ShieldCheck, ShoppingBag, Tags, Trash2,
  UserRound, Wrench, X, Zap
} from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

type Language = "en" | "ta";
type Product = {
  id: string; name: string; description: string | null; price: string | null;
  price_type: "fixed" | "enquiry"; condition: string; quantity_available: number;
  category: string; image_path: string | null; image_paths?: string[]; compatible_vehicles?: string[];
  known_defects?: string | null; part_number?: string | null;
  category_id?: string; category_slug?: string; is_active?: boolean;
  compatibility?: Array<{ modelId: string; verificationStatus: "verified" | "unverified"; make: string; model: string; notes: string | null }>;
};
type AdminVehicleModel = { id: string; make: string; model: string; model_year_start: number | null; model_year_end: number | null };
type AdminSession = { authenticated: boolean; username?: string };
type MarketplaceSettings = { marketplaceName: string; address: string; contactPhone: string; whatsappNumber: string };
const defaultMarketplaceSettings: MarketplaceSettings = {
  marketplaceName: "M. M. A. Jinna Vehicle Spare Parts",
  address: "Peraiyur, Kamarajar Street, near Zam Zam Mahal",
  contactPhone: "9345883525",
  whatsappNumber: "6382328587"
};
const MarketplaceSettingsContext = createContext<MarketplaceSettings>(defaultMarketplaceSettings);
type ApiStatus = "loading" | "ready" | "unavailable";
type CartLine = { product: Product; quantity: number };
type ShoppingState = {
  cart: CartLine[];
  wishlist: Product[];
  addToCart: (product: Product, quantity?: number) => boolean;
  setCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  toggleWishlist: (product: Product) => void;
  clearCart: () => void;
};
const ShoppingContext = createContext<ShoppingState | null>(null);
const CART_KEY = "reparts.cart.v1";
const WISHLIST_KEY = "reparts.wishlist.v1";
function readLocal<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return value === null ? fallback : value as T;
  } catch {
    return fallback;
  }
}
function ShoppingProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>(() => {
    const saved = readLocal<unknown>(CART_KEY, []);
    return Array.isArray(saved) ? saved.filter((line): line is CartLine =>
      !!line && typeof line === "object" && "product" in line && !!line.product &&
      typeof line.product.id === "string" && typeof line.quantity === "number" &&
      Number.isInteger(line.quantity) && line.quantity > 0 && Number.isInteger(line.product.quantity_available) &&
      line.quantity <= line.product.quantity_available && line.product.price_type === "fixed" &&
      line.product.price !== null && Number.isFinite(Number(line.product.price))
    ) : [];
  });
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    const saved = readLocal<unknown>(WISHLIST_KEY, []);
    return Array.isArray(saved) ? saved.filter((product): product is Product =>
      !!product && typeof product === "object" && "id" in product && typeof product.id === "string" &&
      "name" in product && typeof product.name === "string"
    ) : [];
  });
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Browser storage can be unavailable. */ }
  }, [cart]);
  useEffect(() => {
    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); } catch { /* Browser storage can be unavailable. */ }
  }, [wishlist]);
  const addToCart = (product: Product, quantity = 1) => {
    if (product.price_type !== "fixed" || product.price === null || !Number.isFinite(Number(product.price)) ||
        !Number.isInteger(product.quantity_available) || product.quantity_available <= 0 ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > product.quantity_available) return false;
    setCart(current => {
      const existing = current.find(line => line.product.id === product.id);
      if (!existing) return [...current, { product, quantity }];
      return current.map(line => line.product.id === product.id
        ? { product, quantity: Math.min(product.quantity_available, line.quantity + quantity) }
        : line);
    });
    return true;
  };
  const setCartQuantity = (productId: string, quantity: number) => setCart(current => current.flatMap(line => {
    if (line.product.id !== productId) return [line];
    if (!Number.isInteger(quantity) || quantity <= 0) return [];
    return [{ ...line, quantity: Math.min(quantity, line.product.quantity_available) }];
  }));
  const removeFromCart = (productId: string) => setCart(current => current.filter(line => line.product.id !== productId));
  const toggleWishlist = (product: Product) => setWishlist(current => current.some(item => item.id === product.id)
    ? current.filter(item => item.id !== product.id)
    : [...current, product]);
  const clearCart = () => setCart([]);
  return <ShoppingContext.Provider value={{ cart, wishlist, addToCart, setCartQuantity, removeFromCart, toggleWishlist, clearCart }}>{children}</ShoppingContext.Provider>;
}
function useShopping() {
  const shopping = useContext(ShoppingContext);
  if (!shopping) throw new Error("Shopping controls must be inside ShoppingProvider.");
  return shopping;
}
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${apiBase.replace(/\/+$/, "")}${path}`;
const configuredWhatsApp = import.meta.env.VITE_WHATSAPP_NUMBER?.trim() ?? "";

function whatsappLink(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!/^\+?[\d\s()-]{8,20}$/.test(value) || !/^\d{8,15}$/.test(digits)) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

function marketplacePhoneLink(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `tel:+${digits.length === 10 ? `91${digits}` : digits}`;
}

function validMarketplaceSettings(value: unknown): value is MarketplaceSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return typeof settings.marketplaceName === "string" && typeof settings.address === "string" &&
    typeof settings.contactPhone === "string" && typeof settings.whatsappNumber === "string";
}

const copy = {
  en: {
    nav: ["Home", "Used Parts", "Sell a Vehicle", "How It Works", "About", "Contact"],
    browse: "Browse parts", sell: "Sell your vehicle", heroTag: "Give every part another purpose",
    headline: "A better way to\nmove parts forward.", intro: "Explore listed used auto parts or start an enquiry about a vehicle you’re ready to sell. Clear information, one practical next step.",
    available: "Parts with a second life.", availableText: "Browse current listings. Availability is based on the business inventory; no catalogue items are invented.",
    categories: "Explore by category", reusable: "Reusable materials", steps: "Straightforward from start to finish",
    stepsText: ["Browse available inventory", "Ask about fit and availability", "Connect with the business"],
    promise: "Less waste. More useful miles.", promiseText: "Reusing parts can keep serviceable components in circulation. Every item’s condition and compatibility should be confirmed before purchase.",
    sellTitle: "Have a vehicle to sell?", sellText: "Share the details and the business can follow up. Any purchase decision or value is confirmed only after review and inspection.",
    enquiry: "Start a vehicle enquiry", explore: "Explore available parts", configuredContact: "M. M. A. Jinna Vehicle Spare Parts",
    search: "Search parts by name", category: "Category", make: "Make", model: "Model", condition: "Condition",
    searchSuggestions: "Matching products", searchLoading: "Searching listings…", nameAZ: "Name: A to Z", productImages: "Product images", categoryListingsCount: "available listings",
    gridView: "Grid view", listView: "List view", conditionNote: "Condition describes assessed part condition; new/used classification is not available in listings.",
    recentlyAdded: "Recently added parts", categoriesUnavailable: "Categories are unavailable right now.",
    minimum: "Min price", maximum: "Max price", sort: "Sort by", newest: "Newest", lowHigh: "Price: low to high", highLow: "Price: high to low",
    apply: "Apply filters", clear: "Clear filters", showing: "Current available inventory", loading: "Loading inventory…",
    empty: "No available parts match this search.", unavailable: "Listings are temporarily unavailable. Please try again later.",
    previous: "Previous", next: "Next", page: "Page", requestPrice: "Request price", availableLabel: "Available",
    unavailableLabel: "Unavailable", viewDetails: "View details", backParts: "Back to parts", enquirePart: "Enquire about this part",
    chatOnWhatsApp: "Ask about this part on WhatsApp",
    compatibilityNotice: "Compatibility must be confirmed with the business before purchase.", verified: "Verified fit",
    notVerified: "Not verified", detailsUnavailable: "This product is not available or could not be loaded.",
    categoryOptions: ["Motorcycle","Scooter","Car","Tractor","Engine","Gearbox","Electrical","Wheels","Body parts","Scrap material","Other"],
    conditionOptions: ["Excellent","Good","Fair","Poor","Unassessed"],
    vehicleOptions: ["Motorcycle","Scooter","Car","Tractor","Commercial vehicle","Other"],
    vehicleConditionOptions: ["Running","Damaged","Not running","Scrap","Unknown"],
    noImage: "Image not provided", all: "All", selectOption: "Select…",
    partNumber: "Part number", compatibleVehicles: "Compatible vehicles", knownDefects: "Known defects",
    removeFile: "Remove", photoUploadNote: "Image upload is not connected yet. Files are checked locally and will not be uploaded.",
    name: "Your name", phone: "Mobile number", vehicle: "Vehicle type", bike: "Motorcycle / Scooter", car: "Car",
    makeModel: "Make and model", year: "Manufacturing year (optional)", fuel: "Fuel type (optional)", location: "Approximate location",
    vehicleCondition: "Vehicle condition", description: "Description and known damage", photos: "Vehicle photos (optional)",
    invalidFiles: "Use JPG, PNG, or WebP images up to 5 MB each.",
    consent: "I agree to be contacted about this enquiry and have read the privacy policy.",
    send: "Submit enquiry", sending: "Submitting…", success: "Your enquiry was submitted. The business can follow up after review.",
    contactSuccess: "Your message was submitted.", formError: "Please review the highlighted fields and try again.",
    serviceUnavailable: "Submission is not available until the backend database is configured. Your information was not sent.",
    required: "This field is required.", validPhone: "Enter a valid phone number.", validEmail: "Enter a valid email address.",
    validYear: `Enter a year from 1886 through ${new Date().getFullYear()}.`,
    productMessage: "Hello, I have an enquiry about this listed part.",
    productId: "Product ID", productName: "Product",
    about: "Practical vehicle reuse, built around transparent information.", aboutBody: "This platform brings listed used automotive parts and vehicle purchase enquiries into one clear place. Business-specific details and services remain configurable and are not assumed.",
    services: ["Current listed used parts", "Vehicle sale enquiries", "Availability and compatibility questions"],
    howTitle: "How it works", howBody: "Listings and enquiry details help start a conversation. The business confirms availability, compatibility, inspection needs, and any offer directly.",
    contactTitle: "Contact the business", contactBody: "Visit or contact M. M. A. Jinna Vehicle Spare Parts in Peraiyur.",
    email: "Email (optional)", message: "How can we help?", sendMessage: "Send message",
    faqTitle: "Frequently asked questions", faqs: [
      ["Are all parts shown in stock?", "Only active products with available quantity are listed. Confirm availability with the business before travelling or purchasing."],
      ["Is vehicle compatibility guaranteed?", "Compatibility must be verified for the exact model and year. Unverified listings are labelled."],
      ["Can a photo determine a vehicle's mechanical condition?", "No. Photographs cannot establish internal mechanical condition. Any in-person inspection and final decision belongs to the business."],
      ["How is a scrap vehicle price decided?", "No purchase price is promised by this website. The business must review the details and inspect the vehicle."]
    ],
    privacyTitle: "Privacy policy", privacyBody: "Only submit information you are comfortable sharing for an enquiry. Submitted contact and vehicle details are intended for the business to respond. The platform does not claim a retention period or privacy practice beyond this notice until the business configures its policies. Contact the business to request access or deletion once contact details are available.",
    termsTitle: "Terms and conditions", termsBody: "Catalogue information is provided to support an enquiry and may change as stock changes. Confirm price, condition, availability, fitment, and terms directly with the business. A visible description is not a mechanical certification. Vehicle enquiries are not purchase offers or guarantees.",
    notFound: "This page could not be found.", returnHome: "Return home",
    inventoryLabel: "Inventory", aboutLabel: "About", vehiclePurchaseLabel: "Vehicle purchase enquiry",
    processLabel: "The process", faqLabel: "FAQ", informationLabel: "Information",
    catalogueLabel: "The catalogue", reuseLabel: "Reuse with clarity",
    heroFoot: ["Scrap vehicles", "Used auto parts", "Responsible reuse"],
    switchToTamil: "Switch language to Tamil", switchToEnglish: "Switch language to English",
    skipToContent: "Skip to content", openNavigation: "Open navigation", closeNavigation: "Close navigation",
    mainNavigation: "Main navigation", footerNavigation: "Policies and help",
    inspectionStep: "The business reviews details and arranges an inspection if appropriate.",
    vehicleEnquiryLabel: "Vehicle enquiry", contactLabel: "Contact",
    admin: "Admin", adminLogin: "Administrator access", adminPending: "Admin API reads and writes are authorized by the signed server-side administrator session.",
    adminNav: ["Overview", "Products", "Add product", "Categories", "Vehicle enquiries", "Contact enquiries", "Reports", "Settings"],
    adminColumns: ["Product","Category","Condition","Quantity","Status","Slug","Listed products","Customer","Vehicle","Location","Contact","Message","Received"],
    adminEditProduct: "Edit product", adminFields: ["Product name","SKU / product code","Category","Vehicle type","Bike brand","Bike model","Verified model year / range","Verified variant / engine capacity","Description","Actual selling price (INR)","Explicit stock quantity","Product photos","Publication status","Compatibility verification"],
    adminSave: "Save changes",
    authNotReady: "Sign in with the administrator account provisioned for this backend.",
    status: "Service status", aiPending: "Photo-based condition assessment is not available yet. No AI results are generated.",
    assistant: "AI Assistant", assistantIntro: "Ask about reference models and spare parts. This catalogue is not live inventory; fitment, stock, prices, and availability are not verified.",
    assistantInput: "Ask about a model or spare part", assistantSend: "Send message", assistantLoading: "Checking the reference catalogue…",
    assistantUnavailable: "The assistant is temporarily unavailable. Please try again.", assistantNotConfigured: "The assistant is not configured yet. A server administrator must configure an OpenAI-compatible Chat Completions provider in the backend environment. Do not share API keys in this chat.",
    assistantCatalogueEmpty: "The source catalogue has no entries yet. The assistant will be available after the source PDF records are added.",
    assistantRetry: "Retry", assistantYou: "You", assistantLabel: "Assistant", assistantParts: "Reference parts", assistantModels: "Reference models",
    assistantSourceNote: "Reference information only — not confirmed compatibility or current stock.", assistantExactDetails: "For fitment questions, include the exact make, model, year, and variant.",
    assistantEmpty: "No conversation yet. Ask about a motorcycle model or spare part.",
    assistantModelPeriod: "Source covers models listed for 2001–2017 only.", assistantOutsidePeriod: "Marked outside the source period.", assistantDiscontinued: "Marked discontinued in the source.",
    cart: "Cart", wishlist: "Wishlist", addToCart: "Add to cart", saved: "Saved", remove: "Remove", quantity: "Quantity", subtotal: "Subtotal", unitPrice: "Unit price", clearCart: "Clear cart",
    cartEmpty: "Your cart is empty.", wishlistEmpty: "Your wishlist is empty.", continueShopping: "Continue shopping", cartNotice: "Your cart is saved only in this browser. Inventory is not revalidated until backend checkout is implemented; no order or payment can be placed here.",
    wishlistNotice: "Saved only in this browser. Availability may change; confirm current inventory before enquiring.",
    noPricedProduct: "Enquiry-only products cannot be added to the cart.", priceNotSet: "Price not set", stock: "In stock",
    adminUsername: "Username or email", adminPassword: "Password", adminLoginSubmit: "Sign in",
    showPassword: "Show password", hidePassword: "Hide password", adminNoSession: "No administrator session is active.",
    adminSection: "Administrator workspace", productRecords: "Product records", addProduct: "Add product", adminProductList: "Products",
    adminSecurityNotice: "All changes are authorized by the backend session.", adminPersistenceNotice: "Changes are saved only after the backend confirms the database transaction.",
    adminImageNotice: "Images can be attached by HTTPS URL. File upload requires persistent private storage and is not available.", draftLabel: "Draft", publishedLabel: "Published",
    adminProductsIntro: "This protected view includes active and inactive product records from the admin API.",
    adminCategoryAll: "All categories", adminSearchProducts: "Search product records", adminRefresh: "Refresh products",
    adminProductsLoading: "Loading product records…", adminProductsError: "Product records could not be loaded. Try again later.",
    adminCategoriesUnavailable: "Category filters are unavailable right now.",
    adminProductsEmpty: "No products were found.", adminNoMatches: "No products match these filters.",
    adminAvailableListings: "Products on this page", adminStockSnapshot: "Stock on this page", adminReadOnly: "Protected inventory",
    adminDetails: "Details", adminEdit: "Edit product", adminBackToProducts: "Back to products", adminNotFound: "This product could not be found.",
    adminViewPublicListing: "Open public listing",
    adminCondition: "Assessed condition", adminPriceType: "Price type", adminFixedPrice: "Fixed price", adminEnquiryPrice: "Ask for price",
    adminImageUrl: "Existing image URL", adminChooseImage: "Choose image for local preview", adminImagePreview: "Image preview",
    adminLocalPreview: "Local preview only. The image is not uploaded or saved.", adminNoImage: "No image selected",
    adminCompatibilityNote: "Select only models supported by the project catalogue. Mark compatibility verified only when you have supporting evidence.",
    adminSavingUnavailable: "This change has not been saved.",
    adminImageUploadUnavailable: "File upload is unavailable. Use an HTTPS image URL or remove the selected file.",
    adminDraftTitle: "Product draft", adminNameField: "Product name", adminDescriptionField: "Description", adminPartNumberField: "Part number",
    adminMakeField: "Bike make", adminModelField: "Compatible bike model", adminPriceField: "Actual price (INR)",
    adminStockField: "Actual stock quantity", adminConditionField: "Condition", adminCategoryField: "Category",
    adminValidationName: "Enter a product name.", adminValidationCategory: "Select a category.", adminValidationCondition: "Select a condition.",
    adminValidationPrice: "Enter a valid non-negative price for a fixed-price product.", adminValidationStock: "Enter a non-negative whole-number stock quantity.",
    adminValidationImageUrl: "Enter a valid HTTP or HTTPS image URL.", adminProductLoadError: "Product details could not be loaded from the public catalogue.",
    adminNoPrice: "No fixed price is listed", adminNoCompatibility: "No verified compatibility is listed", adminUnavailableInventory: "Set listing status and stock explicitly.",
    adminReviewDraft: "Save product", adminFormEditIntro: "Edit the persisted product details. Changes are applied only after the backend confirms saving.",
    adminFormCreateIntro: "Enter actual product data. The product is published only if enabled and stock is greater than zero.",
    adminNotAdminSystem: "Authenticated administrator session.",
    adminLoginUnavailable: "Sign-in could not be completed. Check the configured backend administrator and try again.",
    adminLoginInvalid: "Invalid username or password.", adminLogout: "Sign out", adminSigningIn: "Signing in…",
    adminSignedIn: "Signed in successfully.", adminSaved: "Product saved successfully.", adminArchived: "Product archived successfully.",
    adminSaveFailed: "The product was not saved.", adminArchive: "Archive product", adminArchiveConfirm: "Archive this product? It will no longer appear in the public catalogue.",
    adminArchiveFailed: "The product could not be archived.", adminActive: "Publish when stock is available", adminInactive: "Unpublished",
    adminCompatibilityModels: "Compatible models", adminCompatibilityVerified: "Verified", adminCompatibilityUnverified: "Unverified",
    adminSessionExpired: "Your administrator session has expired. Sign in again.", adminAuthenticating: "Checking administrator session…",
    fieldSku: "SKU / product code", fieldVehicle: "Vehicle type", fieldBikeBrand: "Bike brand", fieldBikeModel: "Bike model", fieldYear: "Verified model year / range",
    fieldVariant: "Verified variant / engine capacity", fieldPartBrand: "Part brand, if known", fieldPrice: "Actual selling price (INR)", fieldStock: "Explicit stock quantity",
    fieldStatus: "Listing status", fieldSpecifications: "Specifications", fieldCompatibility: "Compatibility verification", fieldPhotos: "Product photos",
    compatibilityUnverified: "Not verified", compatibilityVerified: "Verified from evidence", priceRequired: "Enter a real price before publishing.", stockRequired: "Enter a non-negative whole-unit stock quantity before publishing.",
    productNameRequired: "Product name is required.", fieldCategory: "Product category", adminSaveDisabled: "Save unavailable",     productsNone: "Product records cannot be listed until the protected backend is configured.",
    addedToCart: "Added to your browser cart.", saveToWishlist: "Save to wishlist",
    adminWorkspaceSummary: "Manage live catalogue data, customer enquiries, reports and saved marketplace contact settings.",
    adminCategoriesIntro: "Manage categories already stored in the marketplace database. Categories cannot be archived because the current schema has no active status.",
    adminCategorySearch: "Search categories", adminCategoryName: "Category name", adminCategoryAdd: "Add category",
    adminCategoryEdit: "Edit category", adminCategorySave: "Save category", adminCategorySaved: "Category saved.",
    adminCategoryDuplicate: "A category with this name already exists.", adminCategoryEmpty: "No categories have been created.",
    adminCategoryNoDelete: "Category deletion and activation are not supported by the current schema.",
    adminSearchEnquiries: "Search submitted enquiries", adminFilterStatus: "Filter by status", adminViewEnquiry: "View details",
    adminUpdateStatus: "Update status", adminNoEnquiries: "No enquiries found.", adminVehicleDetails: "Vehicle details",
    adminEnquiryImages: "Submitted image references", adminReportsIntro: "Metrics are calculated from current database records. Sales and revenue are not recorded by this application.",
    adminTotalProducts: "Total products", adminActiveProducts: "Active products", adminInactiveProducts: "Inactive products",
    adminCategoriesCount: "Categories", adminVehicleEnquiriesCount: "Vehicle enquiries", adminContactEnquiriesCount: "Contact enquiries",
    adminStockUnits: "Recorded stock units", adminOutOfStock: "Products with zero stock", adminDownloadCsv: "Download CSV",
    adminSettingsIntro: "These public marketplace details are saved in the existing business settings table and shown on the storefront.",
    adminMarketplaceName: "Marketplace name", adminBusinessAddress: "Business address", adminContactPhone: "Contact phone",
    adminWhatsappNumber: "WhatsApp number", adminSettingsSave: "Save settings", adminSettingsSaved: "Marketplace settings saved.",
    adminPublicSettingsNote: "Do not enter passwords, API keys or other secrets here.",
    adminWorkspaceLoading: "Loading saved records…", adminWorkspaceLoadError: "Records could not be loaded. Check database availability and try again.",
    adminWorkspaceSaveError: "The change was not saved.", adminStatusNew: "New", adminStatusContacted: "Contacted",
    adminStatusInspection: "Inspection scheduled", adminStatusPrice: "Price discussed", adminStatusCompleted: "Completed",
    adminStatusRejected: "Rejected", adminStatusUpdated: "Enquiry status updated.", adminTotalStock: "Total stock", adminErrorRetry: "Retry"
  },
  ta: {
    nav: ["முகப்பு", "பயன்படுத்திய பாகங்கள்", "வாகனத்தை விற்க", "செயல்முறை", "எங்களைப் பற்றி", "தொடர்பு"],
    browse: "பாகங்களைப் பார்க்க", sell: "வாகனத்தை விற்க", heroTag: "ஒவ்வொரு பாகத்திற்கும் மறுபயன்",
    headline: "பாகங்களுக்கான\nசிறந்த மறுபயன்பாடு.", intro: "பட்டியலிடப்பட்ட பழைய வாகனப் பாகங்களைப் பாருங்கள் அல்லது விற்க விரும்பும் வாகனத்தைப் பற்றி விசாரிக்கவும்.",
    available: "மறுபயன்பாட்டிற்கான பாகங்கள்.", availableText: "தற்போதைய பட்டியல்களைப் பாருங்கள். வணிக இருப்பில் உள்ளவை மட்டுமே காட்டப்படும்.",
    categories: "வகைகள் மூலம் தேடுங்கள்", reusable: "மறுபயன்பாட்டு பொருட்கள்", steps: "தொடக்கம் முதல் முடிவு வரை எளிமை",
    stepsText: ["கிடைக்கும் இருப்பைப் பாருங்கள்", "பொருத்தம் மற்றும் இருப்பைக் கேளுங்கள்", "வணிகத்துடன் தொடர்பு கொள்ளுங்கள்"],
    promise: "குறைந்த கழிவு. மேலும் பயனுள்ள பயணம்.", promiseText: "மீண்டும் பயன்படுத்தக்கூடிய பாகங்களைச் சுழற்சியில் வைத்திருக்கலாம். வாங்குவதற்கு முன் நிலை மற்றும் பொருத்தத்தை உறுதி செய்யுங்கள்.",
    sellTitle: "விற்க வேண்டிய வாகனம் உள்ளதா?", sellText: "விவரங்களைப் பகிருங்கள்; வணிகம் தொடர்ந்து தொடர்பு கொள்ளலாம். வாங்கும் முடிவும் விலையும் ஆய்வுக்குப் பிறகே உறுதி செய்யப்படும்.",
    enquiry: "வாகன விசாரணையைத் தொடங்குங்கள்", explore: "கிடைக்கும் பாகங்களைப் பாருங்கள்", configuredContact: "M. M. A. Jinna வாகன உதிரி பாகங்கள்",
    search: "பாகத்தின் பெயரைத் தேடுங்கள்", category: "வகை", make: "நிறுவனம்", model: "மாடல்", condition: "நிலை",
    searchSuggestions: "பொருந்தும் பொருட்கள்", searchLoading: "பட்டியல்களைத் தேடுகிறது…", nameAZ: "பெயர்: அ முதல் ஔ வரை", productImages: "பொருள் படங்கள்", categoryListingsCount: "கிடைக்கும் பட்டியல்கள்",
    gridView: "கட்டக் காட்சி", listView: "பட்டியல் காட்சி", conditionNote: "நிலை என்பது மதிப்பிடப்பட்ட பாக நிலை; புதியது/பழையது வகைப்பாடு பட்டியலில் இல்லை.",
    recentlyAdded: "சமீபத்தில் சேர்க்கப்பட்ட பாகங்கள்", categoriesUnavailable: "வகைகள் இப்போது கிடைக்கவில்லை.",
    minimum: "குறைந்த விலை", maximum: "அதிகபட்ச விலை", sort: "வரிசை", newest: "புதியவை", lowHigh: "குறைந்த விலை முதலில்", highLow: "அதிக விலை முதலில்",
    apply: "வடிகட்டுங்கள்", clear: "வடிகட்டிகளை அழி", showing: "தற்போதைய இருப்பு", loading: "இருப்பு ஏற்றப்படுகிறது…",
    empty: "இந்தத் தேடலுக்கு பாகங்கள் இல்லை.", unavailable: "பட்டியல்கள் தற்காலிகமாகக் கிடைக்கவில்லை. பின்னர் முயற்சிக்கவும்.",
    previous: "முந்தையது", next: "அடுத்து", page: "பக்கம்", requestPrice: "விலையைக் கேளுங்கள்", availableLabel: "கிடைக்கும்",
    unavailableLabel: "கிடைக்காது", viewDetails: "விவரங்களைப் பார்க்க", backParts: "பாகங்களுக்குத் திரும்பு", enquirePart: "இந்தப் பாகத்தைப் பற்றி விசாரிக்கவும்",
    chatOnWhatsApp: "இந்தப் பாகம் பற்றி WhatsApp-ல் கேளுங்கள்",
    compatibilityNotice: "வாங்குவதற்கு முன் பொருத்தத்தை வணிகத்திடம் உறுதி செய்யுங்கள்.", verified: "பொருத்தம் உறுதி",
    notVerified: "உறுதி செய்யப்படவில்லை", detailsUnavailable: "இந்தப் பொருள் கிடைக்கவில்லை அல்லது ஏற்ற முடியவில்லை.",
    categoryOptions: ["மோட்டார் சைக்கிள்","ஸ்கூட்டர்","கார்","டிராக்டர்","இயந்திரம்","கியர்பாக்ஸ்","மின்சார பாகங்கள்","சக்கரங்கள்","உடல் பாகங்கள்","ஸ்கிராப் பொருள்","மற்றவை"],
    conditionOptions: ["மிகச் சிறந்தது","நல்லது","சுமாரானது","மோசமானது","மதிப்பிடப்படவில்லை"],
    vehicleOptions: ["மோட்டார் சைக்கிள்","ஸ்கூட்டர்","கார்","டிராக்டர்","வணிக வாகனம்","மற்றவை"],
    vehicleConditionOptions: ["இயங்குகிறது","சேதமடைந்தது","இயங்கவில்லை","ஸ்கிராப்","தெரியவில்லை"],
    noImage: "படம் வழங்கப்படவில்லை", all: "அனைத்தும்", selectOption: "தேர்ந்தெடுக்கவும்…",
    partNumber: "பாக எண்", compatibleVehicles: "பொருந்தும் வாகனங்கள்", knownDefects: "அறியப்பட்ட குறைகள்",
    removeFile: "நீக்கு", photoUploadNote: "படப் பதிவேற்றம் இன்னும் இணைக்கப்படவில்லை. கோப்புகள் உள்ளூரில் சரிபார்க்கப்படும்; பதிவேற்றப்படாது.",
    name: "உங்கள் பெயர்", phone: "கைபேசி எண்", vehicle: "வாகன வகை", bike: "மோட்டார் சைக்கிள் / ஸ்கூட்டர்", car: "கார்",
    makeModel: "நிறுவனம் மற்றும் மாடல்", year: "உற்பத்தி ஆண்டு (விருப்பம்)", fuel: "எரிபொருள் வகை (விருப்பம்)", location: "தோராயமான இடம்",
    vehicleCondition: "வாகன நிலை", description: "விளக்கம் மற்றும் சேதம்", photos: "வாகனப் புகைப்படங்கள் (விருப்பம்)",
    invalidFiles: "ஒவ்வொரு படமும் JPG, PNG அல்லது WebP வடிவில் 5 MB-க்குள் இருக்க வேண்டும்.",
    consent: "இந்த விசாரணை தொடர்பாக என்னைத் தொடர்புகொள்ள ஒப்புக்கொள்கிறேன்; தனியுரிமைக் கொள்கையைப் படித்துள்ளேன்.",
    send: "விசாரணையைச் சமர்ப்பி", sending: "சமர்ப்பிக்கிறது…", success: "உங்கள் விசாரணை சமர்ப்பிக்கப்பட்டது. பரிசீலனைக்குப் பிறகு வணிகம் தொடர்பு கொள்ளலாம்.",
    contactSuccess: "உங்கள் செய்தி சமர்ப்பிக்கப்பட்டது.", formError: "குறிப்பிட்ட புலங்களைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    serviceUnavailable: "பின்தள தரவுத்தளம் அமைக்கப்படும் வரை சமர்ப்பிக்க முடியாது. உங்கள் தகவல் அனுப்பப்படவில்லை.",
    required: "இந்தப் புலம் தேவை.", validPhone: "சரியான கைபேசி எண்ணை உள்ளிடுங்கள்.", validEmail: "சரியான மின்னஞ்சலை உள்ளிடுங்கள்.",
    validYear: `1886 முதல் ${new Date().getFullYear()} வரையிலான ஆண்டை உள்ளிடுங்கள்.`,
    productMessage: "வணக்கம், இந்தப் பட்டியலிடப்பட்ட பாகம் பற்றி விசாரிக்க விரும்புகிறேன்.",
    productId: "பொருள் ID", productName: "பொருள்",
    about: "வெளிப்படையான தகவலுடன் வாகன மறுபயன்பாடு.", aboutBody: "பட்டியலிடப்பட்ட பழைய வாகனப் பாகங்களையும் வாகன விற்பனை விசாரணைகளையும் இந்தத் தளம் ஒருங்கிணைக்கிறது. வணிக விவரங்களும் சேவைகளும் தனியாக அமைக்கப்பட வேண்டும்.",
    services: ["பட்டியலிடப்பட்ட பழைய பாகங்கள்", "வாகன விற்பனை விசாரணைகள்", "இருப்பு மற்றும் பொருத்தம் தொடர்பான கேள்விகள்"],
    howTitle: "செயல்முறை", howBody: "பட்டியல்களும் விசாரணை விவரங்களும் உரையாடலைத் தொடங்க உதவும். இருப்பு, பொருத்தம், ஆய்வு மற்றும் விலையை வணிகம் நேரடியாக உறுதி செய்யும்.",
    contactTitle: "வணிகத்தைத் தொடர்பு கொள்ளுங்கள்", contactBody: "பெரையூரில் உள்ள M. M. A. Jinna வாகன உதிரி பாகங்கள் கடையைப் பார்வையிடவும் அல்லது தொடர்பு கொள்ளவும்.",
    email: "மின்னஞ்சல் (விருப்பம்)", message: "எப்படி உதவலாம்?", sendMessage: "செய்தி அனுப்பு",
    faqTitle: "அடிக்கடி கேட்கப்படும் கேள்விகள்", faqs: [
      ["அனைத்து பாகங்களும் இருப்பில் உள்ளனவா?", "கிடைக்கும் அளவு உள்ள செயலில் இருக்கும் பொருட்கள் மட்டுமே பட்டியலிடப்படும். வருவதற்கு அல்லது வாங்குவதற்கு முன் உறுதி செய்யுங்கள்."],
      ["வாகனப் பொருத்தம் உறுதியா?", "சரியான மாடல் மற்றும் ஆண்டுக்கான பொருத்தத்தை உறுதி செய்ய வேண்டும். உறுதி செய்யப்படாதவை குறிக்கப்படும்."],
      ["புகைப்படம் இயந்திர நிலையை அறியுமா?", "இல்லை. புகைப்படங்களால் உள் இயந்திர நிலையை உறுதி செய்ய முடியாது. நேரடி ஆய்வு மற்றும் முடிவு வணிகத்தின்து."],
      ["ஸ்கிராப் விலை எவ்வாறு முடிவு செய்யப்படும்?", "இந்தத் தளம் விலை உறுதி அளிக்காது. விவரங்களைப் பரிசீலித்து வாகனத்தை ஆய்வு செய்ய வேண்டும்."]
    ],
    privacyTitle: "தனியுரிமைக் கொள்கை", privacyBody: "விசாரணைக்காகப் பகிர விரும்பும் தகவலை மட்டும் சமர்ப்பிக்கவும். தொடர்பு மற்றும் வாகன விவரங்கள் வணிகம் பதிலளிக்கப் பயன்படுத்தப்படும். வணிகம் தனிக் கொள்கைகளை அமைக்கும் வரை தரவு வைத்திருப்பு அல்லது கூடுதல் தனியுரிமை நடைமுறைகள் குறித்து தளம் உறுதி அளிக்காது.",
    termsTitle: "விதிமுறைகள்", termsBody: "இருப்பு மாறக்கூடும். விலை, நிலை, இருப்பு, பொருத்தம் மற்றும் விதிமுறைகளை வணிகத்திடம் நேரடியாக உறுதி செய்யுங்கள். விளக்கம் இயந்திர சான்றிதழ் அல்ல. வாகன விசாரணை வாங்கும் உறுதியோ விலை முன்மொழிவோ அல்ல.",
    notFound: "இந்தப் பக்கத்தைக் காணவில்லை.", returnHome: "முகப்புக்குத் திரும்பு",
    inventoryLabel: "இருப்பு", aboutLabel: "எங்களைப் பற்றி", vehiclePurchaseLabel: "வாகனம் வாங்கும் விசாரணை",
    processLabel: "செயல்முறை", faqLabel: "கேள்விகள்", informationLabel: "தகவல்",
    catalogueLabel: "பட்டியல்", reuseLabel: "தெளிவான மறுபயன்பாடு",
    heroFoot: ["ஸ்கிராப் வாகனங்கள்", "பயன்படுத்திய வாகனப் பாகங்கள்", "பொறுப்பான மறுபயன்பாடு"],
    switchToTamil: "மொழியைத் தமிழுக்கு மாற்று", switchToEnglish: "மொழியை ஆங்கிலத்திற்கு மாற்று",
    skipToContent: "உள்ளடக்கத்திற்குச் செல்லுங்கள்", openNavigation: "வழிசெலுத்தலைத் திற", closeNavigation: "வழிசெலுத்தலை மூடு",
    mainNavigation: "முதன்மை வழிசெலுத்தல்", footerNavigation: "கொள்கைகள் மற்றும் உதவி",
    inspectionStep: "வணிகம் விவரங்களைப் பரிசீலித்து தேவையானால் ஆய்வை ஏற்பாடு செய்யும்.",
    vehicleEnquiryLabel: "வாகன விசாரணை", contactLabel: "தொடர்பு",
    admin: "நிர்வாகம்", adminLogin: "நிர்வாகி அணுகல்", adminPending: "நிர்வாக API வாசிப்பும் மாற்றங்களும் கையொப்பமிட்ட பின்தள நிர்வாகி அமர்வால் அனுமதிக்கப்படுகின்றன.",
    adminNav: ["மேலோட்டம்", "பொருட்கள்", "பொருள் சேர்", "வகைகள்", "வாகன விசாரணைகள்", "தொடர்பு விசாரணைகள்", "அறிக்கைகள்", "அமைப்புகள்"],
    adminColumns: ["பொருள்","வகை","நிலை","அளவு","நிலை","குறியீடு","பட்டியலிட்ட பொருட்கள்","வாடிக்கையாளர்","வாகனம்","இடம்","தொடர்பு","செய்தி","பெறப்பட்ட நாள்"],
    adminEditProduct: "பொருளைத் திருத்து", adminFields: ["பொருள் பெயர்","SKU / பொருள் குறியீடு","வகை","வாகன வகை","பைக் நிறுவனம்","பைக் மாடல்","உறுதி செய்யப்பட்ட மாடல் ஆண்டு / வரம்பு","உறுதி செய்யப்பட்ட வகை / எஞ்சின் திறன்","விளக்கம்","உண்மையான விற்பனை விலை (INR)","தெளிவான இருப்பு எண்ணிக்கை","பொருள் புகைப்படங்கள்","வெளியீட்டு நிலை","பொருத்தம் சரிபார்ப்பு"],
    adminProductsIntro: "இந்தப் பாதுகாக்கப்பட்ட பார்வையில் நிர்வாக API-யிலிருந்து செயலில் மற்றும் செயலற்ற பொருள் பதிவுகள் அடங்கும்.",
    adminCategoryAll: "அனைத்து வகைகள்", adminSearchProducts: "பட்டியலிட்ட பொருட்களைத் தேடு", adminRefresh: "பட்டியலைப் புதுப்பி",
    adminProductsLoading: "பொருள் பதிவுகள் ஏற்றப்படுகின்றன…", adminProductsError: "பொருள் பதிவுகளை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    adminCategoriesUnavailable: "வகை வடிகட்டிகள் இப்போது கிடைக்கவில்லை.",
    adminProductsEmpty: "பொருட்கள் எதுவும் இல்லை.", adminNoMatches: "இந்த வடிகட்டிகளுக்கு பொருந்தும் பொருட்கள் இல்லை.",
    adminAvailableListings: "இந்தப் பக்கப் பொருட்கள்", adminStockSnapshot: "இந்தப் பக்க இருப்பு", adminReadOnly: "பாதுகாக்கப்பட்ட இருப்பு",
    adminDetails: "விவரங்கள்", adminEdit: "பொருளைத் திருத்து", adminBackToProducts: "பொருட்களுக்குத் திரும்பு", adminNotFound: "இந்தப் பொருளைக் காணவில்லை.",
    adminViewPublicListing: "பொதுப் பட்டியலைத் திற",
    adminCondition: "மதிப்பிடப்பட்ட நிலை", adminPriceType: "விலை வகை", adminFixedPrice: "நிலையான விலை", adminEnquiryPrice: "விலையைக் கேளுங்கள்",
    adminImageUrl: "தற்போதைய பட URL", adminChooseImage: "உள்ளூர் முன்னோட்டத்திற்கு படத்தைத் தேர்ந்தெடு", adminImagePreview: "பட முன்னோட்டம்",
    adminLocalPreview: "உள்ளூர் முன்னோட்டம் மட்டும். படம் பதிவேற்றப்படவோ சேமிக்கப்படவோ இல்லை.", adminNoImage: "படம் தேர்ந்தெடுக்கப்படவில்லை",
    adminCompatibilityNote: "திட்ட பட்டியலில் உள்ள மாடல்களை மட்டும் தேர்ந்தெடுக்கவும். ஆதாரம் இருந்தால் மட்டுமே பொருத்தத்தை உறுதி செய்ததாகக் குறிக்கவும்.",
    adminSavingUnavailable: "இந்த மாற்றம் சேமிக்கப்படவில்லை.",
    adminImageUploadUnavailable: "கோப்பு பதிவேற்றம் கிடைக்கவில்லை. HTTPS பட URL பயன்படுத்தவும் அல்லது தேர்ந்தெடுத்த கோப்பை நீக்கவும்.",
    adminDraftTitle: "பொருள் வரைவு", adminNameField: "பொருள் பெயர்", adminDescriptionField: "விளக்கம்", adminPartNumberField: "பொருள் எண்",
    adminMakeField: "பைக் நிறுவனம்", adminModelField: "பொருந்தும் பைக் மாடல்", adminPriceField: "உண்மையான விலை (INR)",
    adminStockField: "உண்மையான இருப்பு அளவு", adminConditionField: "நிலை", adminCategoryField: "வகை",
    adminValidationName: "பொருள் பெயரை உள்ளிடுங்கள்.", adminValidationCategory: "வகையைத் தேர்ந்தெடுக்கவும்.", adminValidationCondition: "நிலையைத் தேர்ந்தெடுக்கவும்.",
    adminValidationPrice: "நிலையான விலைக்கு செல்லுபடியான பூஜ்யம் அல்லது அதற்கு மேற்பட்ட விலையை உள்ளிடுங்கள்.", adminValidationStock: "பூஜ்யம் அல்லது அதற்கு மேற்பட்ட முழு எண்ணை உள்ளிடுங்கள்.",
    adminValidationImageUrl: "சரியான HTTP அல்லது HTTPS பட URL-ஐ உள்ளிடுங்கள்.", adminProductLoadError: "பொதுப் பட்டியலிலிருந்து பொருள் விவரங்களை ஏற்ற முடியவில்லை.",
    adminNoPrice: "நிலையான விலை பட்டியலிடப்படவில்லை", adminNoCompatibility: "உறுதி செய்யப்பட்ட பொருத்தம் இல்லை", adminUnavailableInventory: "இருப்பை இங்கே திருத்த முடியாது.",
    adminReviewDraft: "பொருளைச் சேமி", adminFormEditIntro: "சேமிக்கப்பட்ட விவரங்களைத் திருத்துங்கள். பின்தளம் உறுதிப்படுத்திய பிறகே மாற்றங்கள் அமலும்.",
    adminFormCreateIntro: "உண்மையான பொருள் விவரங்களை உள்ளிடுங்கள். இயக்கப்பட்டும் இருப்பு பூஜ்யத்தை விட அதிகமாகவும் இருந்தால் மட்டுமே வெளியிடப்படும்.",
    adminNotAdminSystem: "அங்கீகரிக்கப்பட்ட நிர்வாகி அமர்வு.",
    adminLoginUnavailable: "உள்நுழைய முடியவில்லை. பின்தள நிர்வாகி அமைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    adminLoginInvalid: "பயனர் பெயர் அல்லது கடவுச்சொல் தவறானது.", adminLogout: "வெளியேறு", adminSigningIn: "உள்நுழைகிறது…",
    adminSignedIn: "வெற்றிகரமாக உள்நுழைந்துள்ளீர்கள்.", adminSaved: "பொருள் வெற்றிகரமாகச் சேமிக்கப்பட்டது.", adminArchived: "பொருள் காப்பகப்படுத்தப்பட்டது.",
    adminSaveFailed: "பொருள் சேமிக்கப்படவில்லை.", adminArchive: "பொருளைக் காப்பகப்படுத்து", adminArchiveConfirm: "இந்தப் பொருளைக் காப்பகப்படுத்தவா? இது பொதுப் பட்டியலில் இனி தோன்றாது.",
    adminArchiveFailed: "பொருளைக் காப்பகப்படுத்த முடியவில்லை.", adminActive: "இருப்பு இருந்தால் வெளியிடு", adminInactive: "வெளியிடப்படவில்லை",
    adminCompatibilityModels: "பொருந்தும் மாடல்கள்", adminCompatibilityVerified: "உறுதி செய்யப்பட்டது", adminCompatibilityUnverified: "உறுதி செய்யப்படவில்லை",
    adminSessionExpired: "நிர்வாகி அமர்வு காலாவதியானது. மீண்டும் உள்நுழையுங்கள்.", adminAuthenticating: "நிர்வாகி அமர்வைச் சரிபார்க்கிறது…",
    adminSave: "மாற்றங்களைச் சேமி",
    authNotReady: "பாதுகாப்பான நிர்வாகி உள்நுழைவு அமைக்கப்படவில்லை. இங்கே உள்நுழைவுத் தகவலை உள்ளிடவோ அனுப்பவோ வேண்டாம்.",
    status: "சேவை நிலை", aiPending: "புகைப்பட அடிப்படையிலான நிலை மதிப்பீடு இன்னும் கிடைக்கவில்லை. AI முடிவுகள் உருவாக்கப்படவில்லை.",
    assistant: "AI உதவியாளர்", assistantIntro: "குறிப்பு மாடல்கள் மற்றும் உதிரிப் பாகங்கள் பற்றி கேளுங்கள். இது நேரடி இருப்புப் பட்டியல் அல்ல; பொருத்தம், இருப்பு, விலை, கிடைக்கும் நிலை உறுதி செய்யப்படவில்லை.",
    assistantInput: "மாடல் அல்லது உதிரிப் பாகம் பற்றி கேளுங்கள்", assistantSend: "செய்தி அனுப்பு", assistantLoading: "குறிப்பு பட்டியலைச் சரிபார்க்கிறது…",
    assistantUnavailable: "உதவியாளர் தற்காலிகமாகக் கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.", assistantNotConfigured: "உதவியாளர் இன்னும் அமைக்கப்படவில்லை. பின்தளச் சூழலில் OpenAI-compatible Chat Completions வழங்குநரை நிர்வாகி அமைக்க வேண்டும். API சாவியை இந்த உரையாடலில் பகிர வேண்டாம்.",
    assistantCatalogueEmpty: "மூலக் குறிப்பு பட்டியலில் இன்னும் பதிவுகள் இல்லை. PDF பதிவுகள் சேர்க்கப்பட்டதும் உதவியாளர் கிடைக்கும்.",
    assistantRetry: "மீண்டும் முயற்சி", assistantYou: "நீங்கள்", assistantLabel: "உதவியாளர்", assistantParts: "குறிப்பு பாகங்கள்", assistantModels: "குறிப்பு மாடல்கள்",
    assistantSourceNote: "குறிப்பு தகவல் மட்டுமே — பொருத்தமோ தற்போதைய இருப்போ உறுதி செய்யப்படவில்லை.", assistantExactDetails: "பொருத்தம் பற்றி கேட்கும்போது சரியான நிறுவனம், மாடல், ஆண்டு, வகையைச் சேர்க்கவும்.",
    assistantEmpty: "உரையாடல் இன்னும் தொடங்கவில்லை. மோட்டார் சைக்கிள் மாடல் அல்லது உதிரிப் பாகம் பற்றி கேளுங்கள்.",
    assistantModelPeriod: "மூல ஆவணம் 2001–2017 பட்டியலிலுள்ள மாடல்களை மட்டுமே உள்ளடக்குகிறது.", assistantOutsidePeriod: "மூல காலத்திற்கு வெளியே எனக் குறிக்கப்பட்டது.", assistantDiscontinued: "மூலத்தில் நிறுத்தப்பட்டதாகக் குறிக்கப்பட்டது.",
    cart: "வண்டி", wishlist: "விருப்பப்பட்டியல்", addToCart: "வண்டியில் சேர்", saved: "சேமிக்கப்பட்டது", remove: "நீக்கு", quantity: "அளவு", subtotal: "மொத்தம்", unitPrice: "ஒன்றின் விலை", clearCart: "வண்டியை காலி செய்",
    cartEmpty: "உங்கள் வண்டி காலியாக உள்ளது.", wishlistEmpty: "விருப்பப்பட்டியல் காலியாக உள்ளது.", continueShopping: "பொருட்களைப் பார்க்க", cartNotice: "உங்கள் வண்டி இந்த உலாவியில் மட்டுமே சேமிக்கப்படுகிறது. பின்தள வாங்குதல் இல்லாததால் இருப்பு மீண்டும் சரிபார்க்கப்படாது; ஆர்டர் அல்லது கட்டணம் செய்ய முடியாது.",
    wishlistNotice: "இந்த உலாவியில் மட்டுமே சேமிக்கப்படும். இருப்பு மாறலாம்; விசாரிப்பதற்கு முன் தற்போதைய இருப்பை உறுதி செய்யுங்கள்.",
    noPricedProduct: "விசாரணை மூலம் மட்டுமே விலை பெறும் பொருளை வண்டியில் சேர்க்க முடியாது.", priceNotSet: "விலை அமைக்கப்படவில்லை", stock: "இருப்பில்",
    adminUsername: "பயனர் பெயர் அல்லது மின்னஞ்சல்", adminPassword: "கடவுச்சொல்", adminLoginSubmit: "உள்நுழை",
    showPassword: "கடவுச்சொல்லைக் காட்டு", hidePassword: "கடவுச்சொல்லை மறை", adminNoSession: "நிர்வாகி அமர்வு செயலில் இல்லை.",
    adminSection: "நிர்வாகப் பகுதி", productRecords: "பொருள் பதிவுகள்", addProduct: "பொருள் சேர்", adminProductList: "பொருட்கள்",
    adminSecurityNotice: "பாதுகாப்பான அங்கீகாரமும் பின்தள அனுமதியும் உறுதி செய்யப்படும் வரை நிர்வாகச் செயல்கள் முடக்கப்பட்டுள்ளன.", adminPersistenceNotice: "இந்த கட்டத்தில் தரவுத்தள மாற்றங்கள் இல்லை; இந்தப் படிவம் மாற்றங்களைச் சேமிக்காது.",
    adminImageNotice: "தனியார் படச் சேமிப்பு அமைக்கப்படவில்லை. பொருள் புகைப்படங்களைப் பதிவேற்றவோ வெளியிடவோ முடியாது.", draftLabel: "வரைவு", publishedLabel: "வெளியிடப்பட்டது",
    fieldSku: "SKU / பொருள் குறியீடு", fieldVehicle: "வாகன வகை", fieldBikeBrand: "வாகன நிறுவனம்", fieldBikeModel: "வாகன மாடல்", fieldYear: "உறுதி செய்யப்பட்ட மாடல் ஆண்டு / வரம்பு",
    fieldVariant: "உறுதி செய்யப்பட்ட வகை / இயந்திர அளவு", fieldPartBrand: "பாக நிறுவனம், தெரிந்தால்", fieldPrice: "உண்மையான விற்பனை விலை (INR)", fieldStock: "தெளிவாக உள்ளிடும் இருப்பு அளவு",
    fieldStatus: "பட்டியல் நிலை", fieldSpecifications: "விவரக்குறிப்புகள்", fieldCompatibility: "பொருத்த உறுதிப்பாடு", fieldPhotos: "பொருள் புகைப்படங்கள்",
    compatibilityUnverified: "உறுதி செய்யப்படவில்லை", compatibilityVerified: "ஆதாரத்தின் அடிப்படையில் உறுதி செய்யப்பட்டது", priceRequired: "வெளியிடுவதற்கு முன் உண்மையான விலையை உள்ளிடுங்கள்.", stockRequired: "வெளியிடுவதற்கு முன் பூஜ்யம் அல்லது அதிகமான முழு எண்ணை உள்ளிடுங்கள்.",
    productNameRequired: "பொருள் பெயர் தேவை.", fieldCategory: "பொருள் வகை", adminSaveDisabled: "சேமிப்பு கிடைக்கவில்லை", productsNone: "பாதுகாக்கப்பட்ட பின்தளம் அமைக்கும் வரை பொருள் பதிவுகளைப் பார்க்க முடியாது.",
    addedToCart: "உங்கள் உலாவி வண்டியில் சேர்க்கப்பட்டது.", saveToWishlist: "விருப்பப்பட்டியலில் சேமி",
    adminWorkspaceSummary: "பட்டியல் தரவு, வாடிக்கையாளர் விசாரணைகள், அறிக்கைகள் மற்றும் சேமிக்கப்பட்ட வணிகத் தொடர்பு அமைப்புகளை நிர்வகிக்கவும்.",
    adminCategoriesIntro: "தரவுத்தளத்தில் உள்ள வகைகளை நிர்வகிக்கவும். தற்போதைய schema-வில் செயலில் நிலை இல்லாததால் வகைகளை காப்பகப்படுத்த முடியாது.",
    adminCategorySearch: "வகைகளைத் தேடு", adminCategoryName: "வகைப் பெயர்", adminCategoryAdd: "வகையைச் சேர்",
    adminCategoryEdit: "வகையைத் திருத்து", adminCategorySave: "வகையைச் சேமி", adminCategorySaved: "வகை சேமிக்கப்பட்டது.",
    adminCategoryDuplicate: "இந்தப் பெயரில் வகை ஏற்கனவே உள்ளது.", adminCategoryEmpty: "வகைகள் எதுவும் உருவாக்கப்படவில்லை.",
    adminCategoryNoDelete: "தற்போதைய schema-வில் வகை நீக்குதல் மற்றும் செயல்படுத்தல் ஆதரிக்கப்படவில்லை.",
    adminSearchEnquiries: "சமர்ப்பித்த விசாரணைகளைத் தேடு", adminFilterStatus: "நிலையின்படி வடிகட்டு", adminViewEnquiry: "விவரங்களைப் பார்",
    adminUpdateStatus: "நிலையை மாற்று", adminNoEnquiries: "விசாரணைகள் இல்லை.", adminVehicleDetails: "வாகன விவரங்கள்",
    adminEnquiryImages: "சமர்ப்பித்த படக் குறிப்புகள்", adminReportsIntro: "தற்போதைய தரவுத்தளப் பதிவுகளிலிருந்து அளவீடுகள் கணக்கிடப்படுகின்றன. விற்பனை மற்றும் வருவாய் இங்கு பதிவு செய்யப்படுவதில்லை.",
    adminTotalProducts: "மொத்தப் பொருட்கள்", adminActiveProducts: "செயலில் உள்ள பொருட்கள்", adminInactiveProducts: "செயலற்ற பொருட்கள்",
    adminCategoriesCount: "வகைகள்", adminVehicleEnquiriesCount: "வாகன விசாரணைகள்", adminContactEnquiriesCount: "தொடர்பு விசாரணைகள்",
    adminStockUnits: "பதிவுசெய்த இருப்பு அலகுகள்", adminOutOfStock: "இருப்பு பூஜ்யமான பொருட்கள்", adminDownloadCsv: "CSV பதிவிறக்கு",
    adminSettingsIntro: "இந்தப் பொதுவான வணிக விவரங்கள் ஏற்கனவே உள்ள business settings அட்டவணையில் சேமிக்கப்பட்டு கடைப் பக்கத்தில் காட்டப்படும்.",
    adminMarketplaceName: "சந்தைப் பெயர்", adminBusinessAddress: "வணிக முகவரி", adminContactPhone: "தொடர்பு தொலைபேசி",
    adminWhatsappNumber: "WhatsApp எண்", adminSettingsSave: "அமைப்புகளைச் சேமி", adminSettingsSaved: "சந்தை அமைப்புகள் சேமிக்கப்பட்டன.",
    adminPublicSettingsNote: "கடவுச்சொல், API key அல்லது ரகசியங்களை இங்கே உள்ளிட வேண்டாம்.",
    adminWorkspaceLoading: "சேமித்த பதிவுகள் ஏற்றப்படுகின்றன…", adminWorkspaceLoadError: "பதிவுகளை ஏற்ற முடியவில்லை. தரவுத்தளத்தைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    adminWorkspaceSaveError: "மாற்றம் சேமிக்கப்படவில்லை.", adminStatusNew: "புதியது", adminStatusContacted: "தொடர்பு கொண்டது",
    adminStatusInspection: "ஆய்வு திட்டமிடப்பட்டது", adminStatusPrice: "விலை பேசப்பட்டது", adminStatusCompleted: "முடிந்தது",
    adminStatusRejected: "நிராகரிக்கப்பட்டது", adminStatusUpdated: "விசாரணை நிலை மாற்றப்பட்டது.", adminTotalStock: "மொத்த இருப்பு", adminErrorRetry: "மீண்டும் முயற்சி"
  }
} satisfies Record<Language, Record<string, string | string[] | string[][]>>;

function useCopy() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("site-language") === "ta" ? "ta" : "en");
  const text = copy[language];
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const switchLanguage = () => {
    const next = language === "en" ? "ta" : "en";
    setLanguage(next);
    localStorage.setItem("site-language", next);
  };
  return { text, language, switchLanguage };
}

function App() {
  const { text, language, switchLanguage } = useCopy();
  return <ShoppingProvider><MarketplaceSettingsProvider><Routes>
    <Route path="/admin/*" element={<AdminLayout text={text} language={language} switchLanguage={switchLanguage} />} />
    <Route path="*" element={<PublicLayout text={text} language={language} switchLanguage={switchLanguage} />} />
  </Routes></MarketplaceSettingsProvider></ShoppingProvider>;
}

type CopyProps = { text: typeof copy.en };
type LayoutProps = CopyProps & { language: Language; switchLanguage: () => void };

function MarketplaceSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaultMarketplaceSettings);
  useEffect(() => {
    const load = () => {
      void fetch(apiUrl("/api/settings"))
        .then(async response => {
          if (!response.ok) return;
          const data: unknown = await response.json();
          if (data && typeof data === "object" && "settings" in data && validMarketplaceSettings(data.settings)) {
            setSettings(data.settings);
          }
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("reparts:settings-changed", load);
    return () => window.removeEventListener("reparts:settings-changed", load);
  }, []);
  return <MarketplaceSettingsContext.Provider value={settings}>{children}</MarketplaceSettingsContext.Provider>;
}

function PublicLayout({ text, language, switchLanguage }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { cart, wishlist } = useShopping();
  const navigate = useNavigate();
  const nav = [
    ["/", text.nav[0]], ["/parts", text.nav[1]], ["/sell-vehicle", text.nav[2]],
    ["/how-it-works", text.nav[3]], ["/about", text.nav[4]], ["/contact", text.nav[5]], ["/assistant", text.assistant]
  ];
  return <div className="site-shell">
    <header className="site-header">
      <Link className="brand business-brand" to="/" aria-label="M. M. A. Jinna Vehicle Spare Parts home"><BusinessBrand/></Link>
      <ProductSearch id="header-search-input" className="header-search" text={text}
        onSearch={value => { navigate(`/parts${value ? `?search=${encodeURIComponent(value)}` : ""}`); setMenuOpen(false); }}
        onOpenProduct={id => { navigate(`/parts/${encodeURIComponent(id)}`); setMenuOpen(false); }} />
      <a className="skip-link" href="#main-content">{text.skipToContent}</a>
      <button className="menu-toggle" aria-label={menuOpen ? text.closeNavigation : text.openNavigation} aria-expanded={menuOpen} aria-controls="public-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button>
      <nav id="public-navigation" className={menuOpen ? "nav-links open" : "nav-links"} aria-label={text.mainNavigation}>
        {nav.map(([path, label]) => <NavLink end={path === "/"} key={path} to={path} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}
        <Link to="/admin/login" className="header-action header-account" aria-label={text.adminLogin}><UserRound size={17}/><span>{text.adminLogin}</span></Link>
        <Link to="/wishlist" className="header-action" aria-label={`${text.wishlist} (${wishlist.length})`}><Heart size={17}/><span>{text.wishlist}</span><b>{wishlist.length}</b></Link>
        <Link to="/cart" className="header-action" aria-label={`${text.cart} (${cart.reduce((sum,line)=>sum+line.quantity,0)})`}><ShoppingBag size={17}/><span>{text.cart}</span><b>{cart.reduce((sum,line)=>sum+line.quantity,0)}</b></Link>
        <button className="language-toggle" onClick={switchLanguage} aria-label={language === "en" ? text.switchToTamil : text.switchToEnglish}><Languages size={16}/>{language === "en" ? "தமிழ்" : "English"}</button>
      </nav>
    </header>
    <main id="main-content"><Routes>
      <Route path="/" element={<Home text={text}/>}/>
      <Route path="/parts" element={<Catalog text={text}/>}/>
      <Route path="/parts/:id" element={<ProductDetails text={text}/>}/>
      <Route path="/about" element={<About text={text}/>}/>
      <Route path="/sell-vehicle" element={<SellGuide text={text}/>}/>
      <Route path="/vehicle-enquiry" element={<VehicleEnquiry text={text}/>}/>
      <Route path="/how-it-works" element={<HowItWorks text={text}/>}/>
      <Route path="/contact" element={<Contact text={text}/>}/>
      <Route path="/assistant" element={<AssistantPage text={text}/>}/>
      <Route path="/cart" element={<CartPage text={text}/>}/>
      <Route path="/wishlist" element={<WishlistPage text={text}/>}/>
      <Route path="/faq" element={<Faq text={text}/>}/>
      <Route path="/privacy" element={<Policy text={text} title={text.privacyTitle} body={text.privacyBody}/>}/>
      <Route path="/terms" element={<Policy text={text} title={text.termsTitle} body={text.termsBody}/>}/>
      <Route path="*" element={<NotFound text={text}/>}/>
    </Routes></main>
    <footer className="site-footer">
      <Link className="brand business-brand" to="/" aria-label="M. M. A. Jinna Vehicle Spare Parts home"><BusinessBrand/></Link>
      <nav aria-label={text.footerNavigation}><Link to="/faq">{text.faqLabel}</Link><Link to="/privacy">{text.privacyTitle}</Link><Link to="/terms">{text.termsTitle}</Link><Link to="/admin/login">{text.admin}</Link></nav>
      <BusinessContact/>
    </footer>
  </div>;
}

function BusinessBrand() {
  const settings = useContext(MarketplaceSettingsContext);
  const brandName = settings.marketplaceName.replace(/\s+vehicle spare parts$/i, "");
  return <>
    <img className="brand-logo" src="/images/mma-jinna-logo.png" alt=""/>
    <span className="brand-copy"><strong>{brandName}</strong><small>Vehicle Spare Parts</small></span>
  </>;
}

function BusinessContact() {
  const settings = useContext(MarketplaceSettingsContext);
  const whatsapp = whatsappLink(settings.whatsappNumber);
  const phone = settings.contactPhone.replace(/\D/g, "");
  return <address className="business-contact">
    <strong>{settings.marketplaceName}</strong>
    {settings.address && <span>{settings.address}</span>}
    {phone && <a href={marketplacePhoneLink(settings.contactPhone)}>Call: {settings.contactPhone}</a>}
    {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp: {settings.whatsappNumber}</a>}
  </address>;
}

function Eyebrow({ children }: { children: ReactNode }) { return <p className="eyebrow"><span className="eyebrow-line" aria-hidden="true"/>{children}</p>; }
function PageIntro({ label, title, body }: { label: string; title: string; body?: string }) {
  return <section className="page-intro"><Eyebrow>{label}</Eyebrow><h1>{title}</h1>{body && <p>{body}</p>}</section>;
}

function ProductSearch({ id, className, text, onSearch, onOpenProduct }: {
  id: string;
  className: string;
  text: CopyProps["text"];
  onSearch: (value: string) => void;
  onOpenProduct: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ search: term, limit: "5", sort: "newest" });
      fetch(`${apiUrl("/api/products")}?${params}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error("Suggestion search unavailable");
          const data: unknown = await response.json();
          if (!data || typeof data !== "object" || !("products" in data) || !Array.isArray(data.products)) {
            throw new Error("Invalid suggestion response");
          }
          setSuggestions(data.products.filter((product): product is Product =>
            !!product && typeof product === "object" &&
            "id" in product && typeof product.id === "string" &&
            "name" in product && typeof product.name === "string" &&
            "category" in product && typeof product.category === "string"
          ));
          setActiveIndex(-1);
        })
        .catch(error => {
          if (!(error instanceof Error) || error.name !== "AbortError") setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectSuggestion = (product: Product) => {
    setOpen(false);
    onOpenProduct(product.id);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const active = suggestions[activeIndex];
    if (open && active) selectSuggestion(active);
    else {
      setOpen(false);
      onSearch(query.trim());
    }
  };
  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return <form className={className} role="search" onSubmit={submit}>
    <label className="sr-only" htmlFor={id}>{text.search}</label>
    <Search size={18} aria-hidden="true"/>
    <input id={id} value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }}
      onFocus={() => setOpen(true)} onKeyDown={onInputKeyDown}
      role="combobox" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0}
      aria-controls={`${id}-suggestions`} aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      autoComplete="off" placeholder={text.search}/>
    <button className={className === "hero-search" ? "button button-primary" : undefined} type="submit" aria-label={text.search}>
      {className === "hero-search" ? <>{text.browse}<ArrowRight size={16}/></> : <Search size={18}/>}
    </button>
    {open && (loading || suggestions.length > 0) && <div className="search-suggestions" id={`${id}-suggestions`} role="listbox" aria-label={text.searchSuggestions}>
      {loading && <p className="suggestion-status" role="status">{text.searchLoading}</p>}
      {suggestions.map((product, index) => <button type="button" role="option" aria-selected={activeIndex === index}
        id={`${id}-option-${index}`} key={product.id} onMouseDown={event => event.preventDefault()}
        onClick={() => selectSuggestion(product)}>
        <span className="suggestion-thumb"><ProductImage src={safeImagePath(product.image_path)} alt="" fallback={text.noImage}/></span>
        <span><strong>{product.name}</strong><small>{product.category}</small></span>
        <ArrowRight size={15}/>
      </button>)}
    </div>}
  </form>;
}

type Category = { id: string; name: string; slug: string; available_products: number };

function CategoryHighlights({ text }: CopyProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<ApiStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/categories"), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Categories unavailable");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("categories" in data) || !Array.isArray(data.categories)) {
          throw new Error("Invalid categories response");
        }
        const rows = data.categories.filter((item): item is Category =>
          !!item && typeof item === "object" &&
          "id" in item && typeof item.id === "string" &&
          "name" in item && typeof item.name === "string" &&
          "slug" in item && typeof item.slug === "string" &&
          "available_products" in item && typeof item.available_products === "number"
        ).filter(category => category.available_products > 0);
        setCategories(rows);
        setStatus("ready");
      })
      .catch(error => {
        if (!(error instanceof Error) || error.name !== "AbortError") setStatus("unavailable");
      });
    return () => controller.abort();
  }, []);

  return <section className="home-categories">
    <div className="section-heading"><div><Eyebrow>{text.categories}</Eyebrow><h2>{text.available}</h2></div><Link className="text-link" to="/parts">{text.browse}<ArrowRight size={16}/></Link></div>
    {status === "loading" && <div className="category-grid" aria-label={text.loading}>{Array.from({ length: 3 }, (_, index) => <div className="category-tile category-skeleton" key={index}/>)}</div>}
    {status === "unavailable" && <div className="state-box state-error" role="status">{text.categoriesUnavailable}</div>}
    {status === "ready" && categories.length > 0 && <div className="category-grid">{categories.slice(0, 6).map((category, index) => {
      const Icon = /motorcycle|scooter|bike/.test(category.slug) ? Bike : /engine|gearbox/.test(category.slug) ? Wrench : PackageSearch;
      const knownIndex = ["motorcycle","scooter","car","tractor","engine","gearbox","electrical","wheels","body-parts","scrap-material","other"].indexOf(category.slug);
      const label = knownIndex >= 0 ? text.categoryOptions[knownIndex] : category.name;
      return <Link className="category-tile" key={category.id} to={`/parts?category=${encodeURIComponent(category.slug)}`}>
        <span className="category-number">{String(index + 1).padStart(2, "0")}</span><Icon size={28}/><h3>{label}</h3><small>{category.available_products} {text.categoryListingsCount}</small><ArrowRight className="tile-arrow" size={18}/>
      </Link>;
    })}</div>}
    {status === "ready" && categories.length === 0 && <div className="state-box">{text.empty}</div>}
  </section>;
}

function Home({ text }: CopyProps) {
  const navigate = useNavigate();
  return <>
    <section className="hero">
      <div className="hero-content"><Eyebrow>{text.heroTag}</Eyebrow><h1>{text.headline}</h1><p className="hero-intro">{text.intro}</p>
        <ProductSearch id="home-search-input" className="hero-search" text={text}
          onSearch={value => navigate(`/parts${value ? `?search=${encodeURIComponent(value)}` : ""}`)}
          onOpenProduct={id => navigate(`/parts/${encodeURIComponent(id)}`)} />
        <div className="hero-actions"><Link className="button button-outline" to="/sell-vehicle">{text.sell}</Link><Link className="button button-quiet" to="/assistant">{text.assistant}<MessageCircle size={16}/></Link></div>
        <Link className="scroll-cue" to="/parts"><ArrowDown size={15}/>{text.explore}</Link>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-center"><Bike size={112} strokeWidth={1}/></div><span className="art-label label-top">REUSE / REPAIR / REPEAT</span><span className="art-label label-bottom">BUILT FOR A SECOND LIFE</span></div>
      <div className="hero-foot">{text.heroFoot.map(item => <span key={item}>{item}</span>)}</div>
    </section>
    <CategoryHighlights text={text}/>
    <section className="inventory-section home-inventory"><div className="section-heading"><div><Eyebrow>{text.catalogueLabel}</Eyebrow><h2>{text.recentlyAdded}</h2></div><p>{text.availableText}</p></div><ProductList text={text} compact/></section>
    <section className="process-section"><Eyebrow>{text.steps}</Eyebrow><h2>{text.howTitle}</h2><div className="process-steps">{text.stepsText.map((step, i) => <div className="process-step" key={step}><span>0{i+1}</span><p>{step}</p></div>)}</div><Link className="text-link" to="/how-it-works">{text.howTitle}<ArrowRight size={16}/></Link></section>
    <section className="value-section"><div className="value-symbol"><Leaf size={30}/></div><div><Eyebrow>{text.reuseLabel}</Eyebrow><h2>{text.promise}</h2><p>{text.promiseText}</p></div><Link className="button button-outline" to="/about">{text.nav[4]}<ArrowRight size={16}/></Link></section>
    <section className="sell-section"><div className="sell-icon"><Recycle size={30}/></div><div><Eyebrow>{text.vehiclePurchaseLabel}</Eyebrow><h2>{text.sellTitle}</h2><p>{text.sellText}</p></div><Link className="button button-primary" to="/vehicle-enquiry">{text.enquiry}<ArrowRight size={16}/></Link></section>
  </>;
}

function ProductList({ text, compact = false }: CopyProps & { compact?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [filter, setFilter] = useState({
    category: params.get("category") ?? "", make: params.get("make") ?? "", model: params.get("model") ?? "",
    condition: params.get("condition") ?? "", minPrice: params.get("minPrice") ?? "", maxPrice: params.get("maxPrice") ?? "",
    sort: params.get("sort") ?? "newest"
  });
  const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<ApiStatus>("loading");
  const [categoryStatus, setCategoryStatus] = useState<ApiStatus>("loading");
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [productRevision, setProductRevision] = useState(0);
  const limit = compact ? 3 : 12;

  useEffect(() => {
    const refresh = () => setProductRevision(value => value + 1);
    window.addEventListener("reparts:products-changed", refresh);
    return () => window.removeEventListener("reparts:products-changed", refresh);
  }, []);

  useEffect(() => {
    if (compact) return;
    const controller = new AbortController();
    fetch(apiUrl("/api/categories"), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Categories unavailable");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("categories" in data) || !Array.isArray(data.categories)) {
          throw new Error("Invalid categories response");
        }
        const rows = data.categories.filter((item): item is Category =>
          !!item && typeof item === "object" &&
          "id" in item && typeof item.id === "string" &&
          "name" in item && typeof item.name === "string" &&
          "slug" in item && typeof item.slug === "string" &&
          "available_products" in item && typeof item.available_products === "number"
        );
        setCategories(rows);
        setCategoryStatus("ready");
      })
      .catch(error => {
        if (!(error instanceof Error) || error.name !== "AbortError") setCategoryStatus("unavailable");
      });
    return () => controller.abort();
  }, [compact]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    const filters = { search, ...filter, limit: String(limit), offset: String(page * limit) };
    Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
    setStatus("loading");
    fetch(`${apiUrl("/api/products")}?${query}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(text.unavailable);
      const data = await response.json() as { products?: Product[]; hasMore?: boolean };
      if (!Array.isArray(data.products)) throw new Error(text.unavailable);
      setProducts(data.products);
      setHasMore(data.hasMore === true);
      setStatus("ready");
    }).catch((cause: unknown) => {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : text.unavailable);
      setStatus("unavailable");
    });
    return () => controller.abort();
  }, [search, filter, page, limit, text.unavailable, productRevision]);

  const changeFilter = (key: keyof typeof filter, value: string) => {
    setFilter(current => ({ ...current, [key]: value }));
    if (page > 0) {
      const next = new URLSearchParams(params);
      next.delete("page");
      setParams(next);
    }
  };
  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    Object.entries({ search, ...filter }).forEach(([key, value]) => { if (value) next.set(key, value); });
    setParams(next);
  };
  const changePage = (nextPage: number) => { const next = new URLSearchParams(params); if (nextPage) next.set("page", String(nextPage)); else next.delete("page"); setParams(next); };

  return <div className="catalog-content">
    {!compact && <form className="filter-panel" onSubmit={applyFilters}>
      <label className="search-box"><Search size={17}/><input value={search} onChange={e => { setSearch(e.target.value); if(page>0){const next=new URLSearchParams(params);next.delete("page");setParams(next);} }} placeholder={text.search}/></label>
      <div className="filter-grid">
        <label>{text.category}<select value={filter.category} onChange={e => changeFilter("category", e.target.value)}><option value="">{text.all}</option>{categories.map(category => {
          const knownIndex = ["motorcycle","scooter","car","tractor","engine","gearbox","electrical","wheels","body-parts","scrap-material","other"].indexOf(category.slug);
          return <option key={category.id} value={category.slug}>{knownIndex >= 0 ? text.categoryOptions[knownIndex] : category.name}</option>;
        })}</select>{categoryStatus === "unavailable" && <small className="field-hint">{text.categoriesUnavailable}</small>}</label>
        <label>{text.make}<input value={filter.make} onChange={e => changeFilter("make", e.target.value)} placeholder={text.make}/></label>
        <label>{text.model}<input value={filter.model} onChange={e => changeFilter("model", e.target.value)} placeholder={text.model}/></label>
        <label>{text.condition}<select value={filter.condition} onChange={e => changeFilter("condition", e.target.value)}><option value="">{text.all}</option>{["excellent","good","fair","poor","unassessed"].map((x,i) => <option key={x} value={x}>{text.conditionOptions[i]}</option>)}</select></label>
        <label>{text.minimum}<input type="number" min="0" step="0.01" value={filter.minPrice} onChange={e => changeFilter("minPrice", e.target.value)}/></label>
        <label>{text.maximum}<input type="number" min="0" step="0.01" value={filter.maxPrice} onChange={e => changeFilter("maxPrice", e.target.value)}/></label>
        <label>{text.sort}<select value={filter.sort} onChange={e => changeFilter("sort", e.target.value)}><option value="newest">{text.newest}</option><option value="name_asc">{text.nameAZ}</option><option value="price_asc">{text.lowHigh}</option><option value="price_desc">{text.highLow}</option></select></label>
      </div>
      <p className="catalog-condition-note"><ShieldCheck size={15}/>{text.conditionNote}</p>
      <div className="filter-actions"><button className="button button-primary" type="submit">{text.apply}</button><button className="button button-quiet" type="button" onClick={() => { setSearch(""); setFilter({category:"",make:"",model:"",condition:"",minPrice:"",maxPrice:"",sort:"newest"}); setParams({}); }}>{text.clear}</button></div>
    </form>}
    {compact && <label className="search-box home-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={text.search}/></label>}
    {!compact && <div className="catalog-toolbar"><p>{status === "ready" ? `${products.length} ${text.showing}` : text.showing}</p><div role="group" aria-label={text.listView} className="view-toggle">
      <button type="button" aria-label={text.gridView} aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17}/></button>
      <button type="button" aria-label={text.listView} aria-pressed={view === "list"} onClick={() => setView("list")}><List size={17}/></button>
    </div></div>}
    <div className="catalog-results">{status === "loading" && <div className={`product-grid${view === "list" ? " list-view" : ""}`} role="status" aria-label={text.loading}>{Array.from({ length: compact ? 3 : 6 }, (_, index) => <ProductSkeleton key={index}/>)}</div>}
      {status === "unavailable" && <div className="state-box state-error" role="alert"><PackageSearch/>{error || text.unavailable}</div>}
      {status === "ready" && products.length === 0 && <div className="state-box"><PackageSearch/>{text.empty}</div>}
      {status === "ready" && products.length > 0 && <div className={`product-grid${view === "list" ? " list-view" : ""}`}>{products.map(product => <ProductCard key={product.id} product={product} text={text}/>)}</div>}
    </div>
    {!compact && status === "ready" && <div className="pagination"><button disabled={page === 0} onClick={() => changePage(page-1)}><ArrowLeft size={15}/>{text.previous}</button><span>{text.page} {page+1}</span><button disabled={!hasMore} onClick={() => changePage(page+1)}>{text.next}<ArrowRight size={15}/></button></div>}
  </div>;
}

function ProductSkeleton() {
  return <article className="product-card product-skeleton" aria-hidden="true">
    <div className="skeleton-image"/><div className="product-info"><span className="skeleton-line short"/>
      <span className="skeleton-line title"/><span className="skeleton-line"/>
      <div className="skeleton-meta"><span className="skeleton-line short"/><span className="skeleton-line short"/></div>
      <span className="skeleton-button"/>
    </div>
  </article>;
}

function safeImagePath(path: string | null) { return path && /^https?:\/\//i.test(path) ? path : null; }
function conditionLabel(condition: string, text: CopyProps["text"]) {
  const keys = ["excellent","good","fair","poor","unassessed"];
  const index = keys.indexOf(condition.toLowerCase());
  return index < 0 ? condition : text.conditionOptions[index];
}

function ProductCard({ product, text }: { product: Product; text: CopyProps["text"] }) {
  const image = safeImagePath(product.image_path);
  const { addToCart, wishlist, toggleWishlist } = useShopping();
  const inWishlist = wishlist.some(item => item.id === product.id);
  const canAddToCart = product.price_type === "fixed" && product.price !== null &&
    Number.isFinite(Number(product.price)) && product.quantity_available > 0;
  return <article className="product-card">
    <button className={`wishlist-toggle${inWishlist ? " selected" : ""}`} type="button" aria-label={inWishlist ? `${text.remove} ${product.name} ${text.wishlist}` : `${text.saveToWishlist} ${product.name}`} aria-pressed={inWishlist} onClick={() => toggleWishlist(product)}><Heart size={18} fill={inWishlist ? "currentColor" : "none"}/></button>
    <Link className="product-image-link" to={`/parts/${encodeURIComponent(product.id)}`} aria-label={`${text.viewDetails}: ${product.name}`}>
      <ProductImage src={image} alt={product.name} fallback={text.noImage}/>
    </Link>
    <div className="product-info"><span className="product-category">{product.category}</span><h3><Link to={`/parts/${encodeURIComponent(product.id)}`}>{product.name}</Link></h3>
      {product.compatible_vehicles?.length ? <p className="product-fitment"><Bike size={14}/>{product.compatible_vehicles.join(", ")}</p> : null}
      <p>{product.description || ""}</p>
      <div className="product-meta"><span>{conditionLabel(product.condition,text)}</span><strong>{product.price_type === "fixed" && product.price !== null ? `₹${product.price}` : text.requestPrice}</strong></div>
      <p className="product-stock">{product.quantity_available > 0 ? `${text.stock}: ${product.quantity_available}` : text.unavailableLabel}</p>
      <div className="product-card-actions"><Link className="product-card-link" to={`/parts/${encodeURIComponent(product.id)}`}>{text.viewDetails}<ArrowRight size={15}/></Link>
        {canAddToCart && <button className="button button-primary product-add" type="button" onClick={() => addToCart(product)}><ShoppingBag size={15}/>{text.addToCart}</button>}
      </div>
    </div>
  </article>;
}

function Catalog({ text }: CopyProps) {
  return <section className="catalog-page"><PageIntro label={text.inventoryLabel} title={text.available} body={text.availableText}/><ProductList text={text}/></section>;
}

function CartPage({ text }: CopyProps) {
  const { cart, setCartQuantity, removeFromCart, clearCart } = useShopping();
  const subtotal = cart.reduce((total, line) => total + Number(line.product.price) * line.quantity, 0);
  return <section className="shopping-page">
    <PageIntro label={text.cart} title={text.cart}/>
    <div className="shopping-content">
      <p className="notice"><ShieldCheck size={17}/>{text.cartNotice}</p>
      {cart.length === 0 ? <div className="state-box"><ShoppingBag/>{text.cartEmpty}<Link className="text-link" to="/parts">{text.continueShopping}<ArrowRight size={15}/></Link></div>
        : <div className="cart-layout"><div className="cart-lines">{cart.map(line => <article className="cart-line" key={line.product.id}>
          <Link to={`/parts/${encodeURIComponent(line.product.id)}`} className="cart-line-image"><ProductImage src={safeImagePath(line.product.image_path)} alt={line.product.name} fallback={text.noImage}/></Link>
          <div className="cart-line-details"><span className="product-category">{line.product.category}</span><h2><Link to={`/parts/${encodeURIComponent(line.product.id)}`}>{line.product.name}</Link></h2>
            <p>{text.unitPrice}: ₹{Number(line.product.price).toFixed(2)} · {text.stock}: {line.product.quantity_available}</p>
            <label>{text.quantity}<select value={line.quantity} onChange={event => setCartQuantity(line.product.id, Number(event.target.value))}>{Array.from({ length: Math.max(1, line.product.quantity_available) }, (_, index) => index + 1).map(quantity => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label>
          </div>
          <div className="cart-line-total"><strong>₹{(Number(line.product.price) * line.quantity).toFixed(2)}</strong><button className="button button-quiet" type="button" onClick={() => removeFromCart(line.product.id)}><Trash2 size={15}/>{text.remove}</button></div>
        </article>)}</div>
        <aside className="cart-summary"><h2>{text.subtotal}</h2><p><span>{text.subtotal}</span><strong>₹{subtotal.toFixed(2)}</strong></p><p className="cart-summary-note">{text.cartNotice}</p><button className="button button-quiet" type="button" onClick={clearCart}>{text.clearCart}</button></aside></div>}
    </div>
  </section>;
}

function WishlistPage({ text }: CopyProps) {
  const { wishlist, toggleWishlist } = useShopping();
  return <section className="shopping-page">
    <PageIntro label={text.wishlist} title={text.wishlist}/>
    <div className="shopping-content">
      <p className="notice"><Heart size={17}/>{text.wishlistNotice}</p>
      {wishlist.length === 0 ? <div className="state-box"><Heart/>{text.wishlistEmpty}<Link className="text-link" to="/parts">{text.continueShopping}<ArrowRight size={15}/></Link></div>
        : <div className="product-grid">{wishlist.map(product => <article className="product-card wishlist-card" key={product.id}>
          <Link className="product-image-link" to={`/parts/${encodeURIComponent(product.id)}`}><ProductImage src={safeImagePath(product.image_path)} alt={product.name} fallback={text.noImage}/></Link>
          <div className="product-info"><span className="product-category">{product.category}</span><h2><Link to={`/parts/${encodeURIComponent(product.id)}`}>{product.name}</Link></h2>
            <p>{product.description ?? ""}</p><div className="product-meta"><span>{conditionLabel(product.condition, text)}</span><strong>{product.price_type === "fixed" && product.price !== null ? `₹${product.price}` : text.requestPrice}</strong></div>
            <div className="product-card-actions"><Link className="product-card-link" to={`/parts/${encodeURIComponent(product.id)}`}>{text.viewDetails}<ArrowRight size={15}/></Link><button className="button button-quiet product-add" type="button" onClick={() => toggleWishlist(product)}><Trash2 size={15}/>{text.remove}</button></div>
          </div>
        </article>)}</div>}
    </div>
  </section>;
}

function ProductDetails({ text }: CopyProps) {
  const { id } = useParams();
  const { addToCart, wishlist, toggleWishlist } = useShopping();
  const marketplaceSettings = useContext(MarketplaceSettingsContext);
  const whatsappLinkNumber = whatsappLink(configuredWhatsApp || marketplaceSettings.whatsappNumber);
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<ApiStatus>("loading");
  const [quantity, setQuantity] = useState(1);
  const [cartFeedback, setCartFeedback] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [productRevision, setProductRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setProductRevision(value => value + 1);
    window.addEventListener("reparts:products-changed", refresh);
    return () => window.removeEventListener("reparts:products-changed", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setProduct(null);
    setQuantity(1);
    fetch(apiUrl(`/api/products/${encodeURIComponent(id ?? "")}`), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Product details unavailable");
      const data = await response.json() as { product?: Product };
      if (!data.product) throw new Error("Product details unavailable");
      setProduct(data.product); setStatus("ready");
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setProduct(null);
      setStatus("unavailable");
    });
    return () => controller.abort();
  }, [id, productRevision]);
  if (status === "loading") return <section className="catalog-page"><div className="state-box" role="status"><span className="loader"/>{text.loading}</div></section>;
  if (status !== "ready" || !product) return <section className="catalog-page"><div className="state-box state-error" role="alert"><PackageSearch/>{text.detailsUnavailable}</div><Link className="text-link" to="/parts">{text.backParts}</Link></section>;
  const image = safeImagePath(product.image_path);
  const images = Array.from(new Set([product.image_path, ...(product.image_paths ?? [])]
    .map(safeImagePath).filter((path): path is string => path !== null)));
  const selectedImage = images[activeImage] ?? image;
  const canAddToCart = product.price_type === "fixed" && product.price !== null &&
    Number.isFinite(Number(product.price)) && product.quantity_available > 0;
  const inWishlist = wishlist.some(item => item.id === product.id);
  return <section className="detail-page"><Link className="text-link" to="/parts"><ArrowLeft size={16}/>{text.backParts}</Link><div className="detail-grid">
    <div><div className="detail-image"><ProductImage src={selectedImage} alt={product.name} fallback={text.noImage} detail/></div>
      {images.length > 1 && <div className="product-gallery" aria-label={text.productImages}>{images.map((path, index) =>
        <button type="button" key={path} aria-label={`${text.productImages} ${index + 1}`} aria-pressed={activeImage === index} onClick={() => setActiveImage(index)}>
          <ProductImage src={path} alt="" fallback={text.noImage}/>
        </button>
      )}</div>}
    </div>
    <div className="detail-copy"><Eyebrow>{product.category}</Eyebrow><h1>{product.name}</h1><p className="detail-description">{product.description}</p>
      <p className="detail-price">{product.price_type === "fixed" && product.price !== null ? `₹${product.price}` : text.requestPrice}</p>
      <dl className="detail-facts"><div><dt>{text.condition}</dt><dd>{conditionLabel(product.condition,text)}</dd></div><div><dt>{text.availableLabel}</dt><dd>{product.quantity_available}</dd></div>{product.part_number && <div><dt>{text.partNumber}</dt><dd>{product.part_number}</dd></div>}</dl>
      {product.compatible_vehicles?.length ? <section><h2>{text.compatibleVehicles}</h2><ul>{product.compatible_vehicles.map(item => <li key={item}>{item}</li>)}</ul></section> : <p className="notice"><ShieldCheck size={17}/>{text.compatibilityNotice}</p>}
      {product.known_defects && <p><strong>{text.knownDefects}:</strong> {product.known_defects}</p>}
      {canAddToCart && <div className="detail-buy">
        <label>{text.quantity}<input type="number" min={1} max={product.quantity_available} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(product.quantity_available, Number(event.target.value) || 1)))}/></label>
        <button className="button button-primary" type="button" onClick={() => setCartFeedback(addToCart(product, quantity) ? text.addedToCart : text.noPricedProduct)}><ShoppingBag size={17}/>{text.addToCart}</button>
      </div>}
      {!canAddToCart && <p className="notice">{product.price === null || product.price_type !== "fixed" ? text.noPricedProduct : text.unavailableLabel}</p>}
      <button className="button button-outline" type="button" aria-pressed={inWishlist} onClick={() => toggleWishlist(product)}><Heart size={16} fill={inWishlist ? "currentColor" : "none"}/>{inWishlist ? text.saved : text.saveToWishlist}</button>
      {cartFeedback && <p className="form-status success" role="status">{cartFeedback}</p>}
      <Link className="button button-primary" to={`/contact?product=${encodeURIComponent(product.name)}&productId=${encodeURIComponent(product.id)}`}>{text.enquirePart}<ArrowRight size={16}/></Link>
      {whatsappLinkNumber && <a className="button button-outline whatsapp-link" href={`https://wa.me/${whatsappLinkNumber}?${new URLSearchParams({ text: `${text.productMessage} ${product.name} (ID: ${product.id})` })}`} target="_blank" rel="noopener noreferrer">{text.chatOnWhatsApp}</a>}
    </div>
  </div></section>;
}

function ProductImage({ src, alt, fallback, detail = false }: { src: string | null; alt: string; fallback: string; detail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  if (!src || failed) return <div className={`product-placeholder${detail ? " detail-product-placeholder" : ""}`} role="img" aria-label={fallback}><Wrench size={detail ? 42 : 32}/><span>{fallback}</span></div>;
  return <div className={`product-image-frame${detail ? " detail-product-frame" : ""}${loaded ? " loaded" : ""}`}>
    {!loaded && <div className="image-loading" aria-hidden="true"><span className="loader"/></div>}
    <img className={detail ? "detail-product-image" : undefined} src={src} alt={alt} loading="lazy"
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)}/>
  </div>;
}

function About({ text }: CopyProps) {
  return <><PageIntro label={text.aboutLabel} title={text.about} body={text.aboutBody}/><section className="content-section"><div className="info-card-grid">{text.services.map((service, i) => <InfoCard key={service} number={`0${i+1}`} title={service} icon={i === 0 ? <Wrench/> : i === 1 ? <Recycle/> : <ShieldCheck/>}/>)}</div><BusinessContact/></section></>;
}
function SellGuide({ text }: CopyProps) {
  return <><PageIntro label={text.vehiclePurchaseLabel} title={text.sellTitle} body={text.sellText}/><section className="content-section"><div className="info-card-grid">{[...text.stepsText, text.inspectionStep].map((step, i) => <InfoCard key={step} number={`0${i+1}`} title={step} icon={i===0?<Bike/>:i===1?<Search/>:i===2?<Clock3/>:<ShieldCheck/>}/>)}</div><div className="sell-cta"><p>{text.howBody}</p><Link className="button button-primary" to="/vehicle-enquiry">{text.enquiry}<ArrowRight size={16}/></Link></div></section></>;
}
function HowItWorks({ text }: CopyProps) { return <><PageIntro label={text.processLabel} title={text.howTitle} body={text.howBody}/><section className="content-section"><div className="process-steps large">{text.stepsText.map((step,i)=><div className="process-step" key={step}><span>0{i+1}</span><p>{step}</p></div>)}</div><p className="notice"><ShieldCheck size={17}/>{text.compatibilityNotice}</p></section></>; }
function InfoCard({ number,title,icon }: { number:string;title:string;icon:ReactNode }) { return <article className="info-card"><span>{number}</span><div className="info-card-icon">{icon}</div><h2>{title}</h2></article>; }

function FormPage({ text, kind }: CopyProps & { kind: "vehicle" | "contact" }) {
  const [queryParams]=useSearchParams();
  const [fields,setFields]=useState<Record<string,string>>(()=>{
    const productName=queryParams.get("product");
    const productId=queryParams.get("productId");
    const message=productName?`${text.productMessage}\n${text.productName}: ${productName}${productId?`\n${text.productId}: ${productId}`:""}`:"";
    const initialFields:Record<string,string>=kind==="contact"?{message}:{};
    return initialFields;
  });
  const [files,setFiles]=useState<File[]>([]);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [status,setStatus]=useState<"idle"|"sending"|"success"|"unavailable">("idle");
  const [submissionError,setSubmissionError]=useState("");
  const isVehicle=kind==="vehicle";
  const title=isVehicle?text.enquiry:text.contactTitle;
  const labels=isVehicle
    ? [["customerName",text.name],["mobileNumber",text.phone],["vehicleCategory",text.vehicle],["makeName",text.make],["modelName",text.model],["manufacturingYear",text.year],["fuelType",text.fuel],["approximateLocation",text.location],["vehicleCondition",text.vehicleCondition],["additionalNotes",text.description]]
    : [["customerName",text.name],["mobileNumber",text.phone],["email",text.email],["message",text.message]];
  const update=(key:string,value:string)=>setFields(current=>({...current,[key]:value}));
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    const nextErrors:Record<string,string>={};
    for(const key of isVehicle?["customerName","mobileNumber","vehicleCategory","makeName","modelName","approximateLocation"]:["customerName","mobileNumber","message"]){
      if(!fields[key]?.trim()) nextErrors[key]=text.required;
    }
    if(fields.mobileNumber&&!/^[+]?[\d\s()-]{8,20}$/.test(fields.mobileNumber.trim())) nextErrors.mobileNumber=text.validPhone;
    if(fields.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) nextErrors.email=text.validEmail;
    if(fields.manufacturingYear&&(!/^\d{4}$/.test(fields.manufacturingYear)||Number(fields.manufacturingYear)<1886||Number(fields.manufacturingYear)>new Date().getFullYear())) nextErrors.manufacturingYear=text.validYear;
    if(!fields.consent) nextErrors.consent=text.required;
    if(files.some(file=>!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024)) nextErrors.photos=text.invalidFiles;
    setErrors(nextErrors);
    if(Object.keys(nextErrors).length) { setStatus("idle"); return; }
    setStatus("sending");setSubmissionError("");
    try {
      const endpoint=isVehicle?"/api/enquiries/vehicle":"/api/enquiries/contact";
      const payload=isVehicle?{
        customerName:fields.customerName,mobileNumber:fields.mobileNumber,
        vehicleCategory:fields.vehicleCategory,makeName:fields.makeName,modelName:fields.modelName,
        manufacturingYear:fields.manufacturingYear||undefined,fuelType:fields.fuelType||undefined,
        approximateLocation:fields.approximateLocation,vehicleCondition:fields.vehicleCondition||undefined,
        additionalNotes:fields.additionalNotes||undefined,consent:true
      }:{
        customerName:fields.customerName,mobileNumber:fields.mobileNumber,
        email:fields.email||undefined,message:fields.message,consent:true
      };
      const response=await fetch(apiUrl(endpoint),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!response.ok) {
        const body=await response.json().catch(()=>null) as {error?:string}|null;
        setSubmissionError(body?.error ?? text.serviceUnavailable);
        setStatus("unavailable");
        return;
      }
      setStatus("success"); setFields({});setFiles([]);
    } catch { setSubmissionError(text.serviceUnavailable);setStatus("unavailable"); }
  };
  return <><PageIntro label={isVehicle?text.vehicleEnquiryLabel:text.contactLabel} title={title} body={isVehicle?text.sellText:text.contactBody}/>{!isVehicle&&<section className="content-section contact-config-section"><BusinessContact/></section>}{isVehicle&&<section className="content-section vehicle-ai-notice"><p className="notice"><ShieldCheck size={17}/>{text.aiPending}</p></section>}<section className="form-section"><form className="form-card" onSubmit={submit} noValidate>
    <div className="form-grid">{labels.map(([key,label])=>{ const errorId=`field-${key}-error`; const describedBy=errors[key]?errorId:undefined; return <label key={key} className={key==="additionalNotes"||key==="message"?"field-wide":""}>{label}{key==="vehicleCategory"?<select id={`field-${key}`} value={fields[key]??""} onChange={e=>update(key,e.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={describedBy}><option value="">{text.selectOption}</option>{["motorcycle","scooter","car","tractor","commercial","other"].map((value,index)=><option value={value} key={value}>{text.vehicleOptions[index]}</option>)}</select>:key==="vehicleCondition"?<select id={`field-${key}`} value={fields[key]??""} onChange={e=>update(key,e.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={describedBy}><option value="">{text.selectOption}</option>{["running","damaged","not-running","scrap","unknown"].map((value,index)=><option value={value} key={value}>{text.vehicleConditionOptions[index]}</option>)}</select>:key==="additionalNotes"||key==="message"?<textarea id={`field-${key}`} rows={5} value={fields[key]??""} onChange={e=>update(key,e.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={describedBy}/>:<input id={`field-${key}`} type={key==="manufacturingYear"?"number":key==="email"?"email":key==="mobileNumber"?"tel":"text"} inputMode={key==="mobileNumber"?"tel":undefined} min={key==="manufacturingYear"?1886:undefined} max={key==="manufacturingYear"?new Date().getFullYear():undefined} value={fields[key]??""} onChange={e=>update(key,e.target.value)} required={["customerName","mobileNumber","vehicleCategory","makeName","modelName","approximateLocation"].includes(key)} aria-invalid={Boolean(errors[key])} aria-describedby={describedBy}/ >}{errors[key]&&<small className="field-error" id={errorId}>{errors[key]}</small>}</label>;})}
      {isVehicle&&<label className="field-wide">{text.photos}<input id="vehicle-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files??[]))} aria-invalid={Boolean(errors.photos)} aria-describedby={errors.photos?"field-photos-error":undefined}/><small>{text.photoUploadNote}</small>{files.length>0&&<ul className="selected-files">{files.map((file,index)=><li key={`${file.name}-${index}`}>{file.name} <span>{(file.size/1024/1024).toFixed(2)} MB</span><button type="button" aria-label={`${text.removeFile} ${file.name}`} onClick={()=>setFiles(current=>current.filter((_,fileIndex)=>fileIndex!==index))}>{text.removeFile}</button></li>)}</ul>}{errors.photos&&<small className="field-error" id="field-photos-error">{errors.photos}</small>}</label>}
    </div>
    <label className="consent"><input type="checkbox" checked={Boolean(fields.consent)} onChange={e=>update("consent",e.target.checked?"yes":"")} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent?"field-consent-error":undefined}/><span>{text.consent} <Link to="/privacy">{text.privacyTitle}</Link>.</span></label>{errors.consent&&<small className="field-error" id="field-consent-error">{errors.consent}</small>}
    {status==="success"&&<p className="form-status success" role="status"><Check size={17}/>{isVehicle?text.success:text.contactSuccess}</p>}
    {status==="unavailable"&&<p className="form-status error" role="alert">{submissionError||text.serviceUnavailable}</p>}
    {Object.keys(errors).length>0&&<p className="form-status error" role="alert">{text.formError}</p>}
    <button className="button button-primary" disabled={status==="sending"}>{status==="sending"?text.sending:isVehicle?text.send:text.sendMessage}<ArrowRight size={16}/></button>
  </form></section></>;
}
function VehicleEnquiry({ text }: CopyProps) { return <FormPage text={text} kind="vehicle"/>; }
function Contact({ text }: CopyProps) { return <FormPage text={text} kind="contact"/>; }
function Faq({ text }: CopyProps) { return <><PageIntro label={text.faqLabel} title={text.faqTitle}/><section className="faq-list">{(text.faqs as string[][]).map(([question,answer])=><details key={question}><summary><CircleHelp size={18}/>{question}<ChevronDown size={17}/></summary><p>{answer}</p></details>)}</section></>; }
function Policy({ text, title,body }: CopyProps & {title:string;body:string}) { return <><PageIntro label={text.informationLabel} title={title}/><section className="content-section policy-copy"><p>{body}</p></section></>; }
function NotFound({ text }: CopyProps) { return <section className="not-found"><span>404</span><h1>{text.notFound}</h1><Link className="button button-primary" to="/">{text.returnHome}<ArrowRight size={16}/></Link></section>; }

type AssistantModel = {
  id: string;
  manufacturer: string;
  model: string;
  engineCapacityApprox?: string;
  notes?: string;
  discontinued: boolean;
  outsidePeriod: boolean;
  source: { document: string; page?: number };
};
type AssistantPart = {
  id: string;
  partName: string;
  category: string;
  vehicleCategory: string;
  fitmentNotes: string | null;
  models: string[];
  source: { document: string; page?: number };
};
type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  parts?: AssistantPart[];
  models?: AssistantModel[];
};
type AssistantError = "not-configured" | "catalogue-empty" | "unavailable";
type AssistantRequest = { message: string; history: { role: "user" | "assistant"; content: string }[] };

function parseAssistantParts(value: unknown): AssistantPart[] | null {
  if (!Array.isArray(value)) return null;
  const parts: AssistantPart[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" ||
        !("partName" in item) || typeof item.partName !== "string" ||
        !("category" in item) || typeof item.category !== "string" ||
        !("vehicleCategory" in item) || typeof item.vehicleCategory !== "string" ||
        !("fitmentNotes" in item) || (item.fitmentNotes !== null && typeof item.fitmentNotes !== "string") ||
        !("models" in item) || !Array.isArray(item.models) || !item.models.every((model: unknown) => typeof model === "string") ||
        !("source" in item) || !item.source || typeof item.source !== "object" ||
        !("document" in item.source) || typeof item.source.document !== "string") return null;
    const source: AssistantPart["source"] = { document: item.source.document };
    if ("page" in item.source && typeof item.source.page === "number") source.page = item.source.page;
    parts.push({
      id: item.id,
      partName: item.partName,
      category: item.category,
      vehicleCategory: item.vehicleCategory,
      fitmentNotes: item.fitmentNotes,
      models: item.models,
      source
    });
  }
  return parts;
}

function parseAssistantModels(value: unknown): AssistantModel[] | null {
  if (!Array.isArray(value)) return null;
  const models: AssistantModel[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" ||
        !("manufacturer" in item) || typeof item.manufacturer !== "string" ||
        !("model" in item) || typeof item.model !== "string" ||
        !("discontinued" in item) || typeof item.discontinued !== "boolean" ||
        !("outsidePeriod" in item) || typeof item.outsidePeriod !== "boolean" ||
        !("source" in item) || !item.source || typeof item.source !== "object" ||
        !("document" in item.source) || typeof item.source.document !== "string") return null;
    const source: AssistantModel["source"] = { document: item.source.document };
    if ("page" in item.source && typeof item.source.page === "number") source.page = item.source.page;
    models.push({
      id: item.id,
      manufacturer: item.manufacturer,
      model: item.model,
      engineCapacityApprox: "engineCapacityApprox" in item && typeof item.engineCapacityApprox === "string" ? item.engineCapacityApprox : undefined,
      notes: "notes" in item && typeof item.notes === "string" ? item.notes : undefined,
      discontinued: item.discontinued,
      outsidePeriod: item.outsidePeriod,
      source
    });
  }
  return models;
}

function AssistantPage({ text }: CopyProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AssistantError | null>(null);
  const [retryRequest, setRetryRequest] = useState<AssistantRequest | null>(null);
  const sendRequest = async (request: AssistantRequest) => {
    setLoading(true);
    setError(null);
    setRetryRequest(request);
    try {
      const response = await fetch(apiUrl("/api/assistant"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error.toLowerCase()
          : "";
        setError(response.status === 503 && message.includes("not configured")
          ? "not-configured"
          : response.status === 503 && (message.includes("no source entries") || message.includes("empty"))
            ? "catalogue-empty"
            : "unavailable");
        return;
      }
      if (!body || typeof body !== "object" || !("reply" in body) || typeof body.reply !== "string" ||
          !("parts" in body) || !("models" in body)) {
        setError("unavailable");
        return;
      }
      const parts = parseAssistantParts(body.parts);
      const models = parseAssistantModels(body.models);
      if (!parts || !models) {
        setError("unavailable");
        return;
      }
      const reply = body.reply;
      setMessages(current => [...current, {
        role: "assistant",
        content: reply,
        parts,
        models
      }]);
      setRetryRequest(null);
    } catch {
      setError("unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.getElementById("assistant-message-end")?.scrollIntoView({ block: "nearest" });
  }, [messages.length, loading]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    const history = messages.map(({ role, content }) => ({ role, content })).slice(-12);
    setMessages(current => [...current, { role: "user", content: message }]);
    setDraft("");
    void sendRequest({ message, history });
  };

  const errorMessage = error === "not-configured" ? text.assistantNotConfigured
    : error === "catalogue-empty" ? text.assistantCatalogueEmpty
      : text.assistantUnavailable;

  return <section className="assistant-page">
    <PageIntro label={text.assistant} title={text.assistant} body={text.assistantIntro}/>
    <section className="assistant-panel" aria-label={text.assistant}>
      <h2 className="assistant-panel-title"><MessageCircle size={20}/>{text.assistant}</h2>
      <p className="assistant-caveat">{text.assistantExactDetails}</p>
      <div className="assistant-messages" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <p className="assistant-empty">{text.assistantEmpty}</p>}
        {messages.map((message, index) => <article className={`assistant-message ${message.role}`} key={index}>
          <p className="assistant-message-label">{message.role === "user" ? text.assistantYou : text.assistantLabel}</p>
          <p className="assistant-message-content">{message.content}</p>
          {message.role === "assistant" && (message.parts?.length || message.models?.length) ? <div className="assistant-results">
            {message.parts?.length ? <section><h2>{text.assistantParts}</h2><ul>{message.parts.map(part =>
              <li key={part.id}><strong>{part.partName}</strong><span>{part.category} · {part.vehicleCategory}</span>{part.fitmentNotes && <span>{part.fitmentNotes}</span>}<small>{part.source.document}{part.source.page ? `, p. ${part.source.page}` : ""}</small></li>
            )}</ul></section> : null}
            {message.models?.length ? <section><h2>{text.assistantModels}</h2><ul>{message.models.map(model =>
              <li key={model.id}><strong>{model.manufacturer} {model.model}</strong>{model.engineCapacityApprox && <span>{model.engineCapacityApprox}</span>}<span>{text.assistantModelPeriod}</span>{model.outsidePeriod && <span>{text.assistantOutsidePeriod}</span>}{model.discontinued && <span>{text.assistantDiscontinued}</span>}{model.notes && <span>{model.notes}</span>}<small>{model.source.document}{model.source.page ? `, p. ${model.source.page}` : ""}</small></li>
            )}</ul></section> : null}
          </div> : null}
          {message.role === "assistant" && <p className="assistant-source-note">{text.assistantSourceNote}</p>}
        </article>)}
        {loading && <p className="assistant-loading" role="status"><span className="loader"/>{text.assistantLoading}</p>}
        <div id="assistant-message-end"/>
      </div>
      {error && <div className="assistant-error" role="alert"><p>{errorMessage}</p>{error === "unavailable" && retryRequest && <button className="button button-quiet" type="button" onClick={() => void sendRequest(retryRequest)} disabled={loading}><RotateCw size={16}/>{text.assistantRetry}</button>}</div>}
      <form className="assistant-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-input">{text.assistantInput}</label>
        <input id="assistant-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={1200} placeholder={text.assistantInput} disabled={loading} autoComplete="off"/>
        <button className="button button-primary" type="submit" disabled={loading || !draft.trim()}><Send size={16}/>{text.assistantSend}</button>
      </form>
    </section>
  </section>;
}

function AdminLayout({ text, language, switchLanguage }: LayoutProps) {
  const [menu,setMenu]=useState(false);
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated" | "unavailable">("loading");
  const [adminUsername, setAdminUsername] = useState("");
  const [authError, setAuthError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();
  const nav=[
    ["/admin",text.adminNav[0]],[ "/admin/products",text.adminNav[1]],[ "/admin/products/new",text.adminNav[2]],[ "/admin/categories",text.adminNav[3]],
    ["/admin/vehicle-enquiries",text.adminNav[4]],[ "/admin/contact-enquiries",text.adminNav[5]],[ "/admin/reports",text.adminNav[6]],[ "/admin/settings",text.adminNav[7]]
  ];
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/auth/session"), { signal: controller.signal, credentials: "include" })
      .then(async response => {
        if (!response.ok) throw new Error("Session check failed.");
        const session: unknown = await response.json();
        if (!session || typeof session !== "object" || !("authenticated" in session) || typeof session.authenticated !== "boolean") {
          throw new Error("Invalid session response.");
        }
        if (session.authenticated) {
          const username = "username" in session && typeof session.username === "string" ? session.username : "";
          setAdminUsername(username);
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("unauthenticated");
        }
      })
      .catch(error => {
        if (!(error instanceof Error) || error.name !== "AbortError") setAuthStatus("unavailable");
      });
    return () => controller.abort();
  }, []);

  const onAuthenticated = (session: AdminSession) => {
    setAdminUsername(session.username ?? "");
    setAuthStatus("authenticated");
    setAuthError("");
  };
  const onUnauthorized = useCallback(() => {
    setAuthStatus("unauthenticated");
    setAdminUsername("");
    setAuthError(text.adminSessionExpired);
    navigate("/admin/login", { replace: true });
  }, [navigate, text.adminSessionExpired]);
  const logout = async () => {
    setLoggingOut(true);
    setAuthError("");
    try {
      const response = await fetch(apiUrl("/api/auth/logout"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      if (!response.ok) throw new Error("Logout failed.");
      setAuthStatus("unauthenticated");
      setAdminUsername("");
      navigate("/admin/login", { replace: true });
    } catch {
      setAuthError(text.adminLoginUnavailable);
    } finally {
      setLoggingOut(false);
    }
  };

  return <div className="site-shell admin-shell"><header className="site-header"><Link className="brand business-brand" to="/" aria-label="M. M. A. Jinna Vehicle Spare Parts home"><BusinessBrand/></Link><a className="skip-link" href="#main-content">{text.skipToContent}</a><button className="menu-toggle" onClick={()=>setMenu(!menu)} aria-label={menu?text.closeNavigation:text.openNavigation} aria-expanded={menu} aria-controls="admin-navigation">{menu?<X/>:<Menu/>}</button><nav id="admin-navigation" className={menu?"nav-links open":"nav-links"} aria-label={text.mainNavigation}><Link to="/" onClick={()=>setMenu(false)}>{text.nav[0]}</Link>{authStatus === "authenticated" && <span className="admin-session-user">{adminUsername}</span>}{authStatus === "authenticated" ? <button className="language-toggle" onClick={() => void logout()} disabled={loggingOut}><LogOut size={16}/>{loggingOut ? text.adminSigningIn : text.adminLogout}</button> : <Link to="/admin/login">{text.adminLogin}</Link>}<button className="language-toggle" onClick={switchLanguage} aria-label={language==="en"?text.switchToTamil:text.switchToEnglish}><Languages size={16}/>{language==="en"?"தமிழ்":"English"}</button></nav></header>
    <div className="admin-layout">{authStatus === "authenticated" && <aside className={menu?"admin-sidebar open":"admin-sidebar"}><Eyebrow>{text.admin}</Eyebrow>{nav.map(([path,label])=><NavLink end={path==="/admin"} to={path} key={path} onClick={()=>setMenu(false)}>{label}</NavLink>)}</aside>}<main className="admin-main" id="main-content">
      <Routes>
        <Route path="login" element={authStatus === "authenticated" ? <Navigate to="/admin" replace/> : <AdminLogin text={text} onAuthenticated={onAuthenticated} externalError={authError}/>}/>
        <Route path="*" element={authStatus === "loading" ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminAuthenticating}</div>
          : authStatus === "authenticated" ? <AdminModulePage text={text} onUnauthorized={onUnauthorized}/>
            : <AdminLogin text={text} onAuthenticated={onAuthenticated} externalError={authError || (authStatus === "unavailable" ? text.adminLoginUnavailable : "")}/>} />
      </Routes>
    </main></div>
    <footer className="site-footer"><Link to="/">{text.nav[0]}</Link><span>{authStatus === "authenticated" ? text.adminSecurityNotice : text.authNotReady}</span></footer>
  </div>;
}
function AdminLogin({ text, onAuthenticated, externalError }: CopyProps & {
  onAuthenticated: (session: AdminSession) => void;
  externalError: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data: unknown = await response.json().catch(() => null);
      setPassword("");
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error : text.adminLoginUnavailable;
        setError(response.status === 401 ? text.adminLoginInvalid : message);
        return;
      }
      if (!data || typeof data !== "object" || !("authenticated" in data) || data.authenticated !== true) {
        setError(text.adminLoginUnavailable);
        return;
      }
      const session: AdminSession = {
        authenticated: true,
        username: "username" in data && typeof data.username === "string" ? data.username : username.trim()
      };
      onAuthenticated(session);
      navigate("/admin", { replace: true });
    } catch {
      setPassword("");
      setError(text.adminLoginUnavailable);
    } finally {
      setLoading(false);
    }
  };

  return <section className="admin-login-page">
    <div className="admin-login-card">
      <div className="admin-login-mark"><ShieldCheck size={25}/></div>
      <Eyebrow>{text.adminSection}</Eyebrow>
      <h1>{text.adminLogin}</h1>
      <p>{text.authNotReady}</p>
      <p className="notice"><Zap size={17}/>{text.adminPending}</p>
      <form onSubmit={event => void submit(event)} noValidate>
        <label htmlFor="admin-username">{text.adminUsername}
          <input id="admin-username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required/>
        </label>
        <label htmlFor="admin-password">{text.adminPassword}
          <span className="admin-password-field">
            <input id="admin-password" name="password" type={showPassword ? "text" : "password"}
              autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/>
            <button type="button" aria-label={showPassword ? text.hidePassword : text.showPassword} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
              {showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}
            </button>
          </span>
        </label>
        {(error || externalError) && <p className="form-status error" role="alert">{error || externalError}</p>}
        <button className="button button-primary admin-login-submit" type="submit" disabled={loading || !username.trim() || !password}>
          {loading ? <><span className="loader"/>{text.adminSigningIn}</> : <>{text.adminLoginSubmit}<ArrowRight size={16}/></>}
        </button>
      </form>
      <div className="admin-login-session"><UserRound size={16}/>{text.adminNoSession}</div>
      <Link className="text-link" to="/">{text.returnHome}<ArrowLeft size={15}/></Link>
    </div>
  </section>;
}

function AdminModulePage({ text, onUnauthorized }: CopyProps & { onUnauthorized: () => void }) {
  const { pathname } = useLocation();
  const current = pathname.replace(/\/+$/, "");
  const editMatch = current.match(/^\/admin\/products\/([0-9a-f-]+)\/edit$/i);
  const detailsMatch = current.match(/^\/admin\/products\/([0-9a-f-]+)$/i);
  if (current === "/admin") return <AdminOverview text={text}/>;
  if (current === "/admin/products") return <AdminProductList text={text} onUnauthorized={onUnauthorized}/>;
  if (current === "/admin/products/new") return <AdminProductForm text={text} onUnauthorized={onUnauthorized}/>;
  if (editMatch) return <AdminProductForm text={text} productId={editMatch[1]} onUnauthorized={onUnauthorized}/>;
  if (detailsMatch) return <AdminProductDetails text={text} productId={detailsMatch[1]} onUnauthorized={onUnauthorized}/>;
  if (current === "/admin/categories") return <AdminCategories text={text} onUnauthorized={onUnauthorized}/>;
  if (current === "/admin/vehicle-enquiries") return <AdminEnquiries text={text} kind="vehicle" onUnauthorized={onUnauthorized}/>;
  if (current === "/admin/contact-enquiries") return <AdminEnquiries text={text} kind="contact" onUnauthorized={onUnauthorized}/>;
  if (current === "/admin/reports") return <AdminReports text={text} onUnauthorized={onUnauthorized}/>;
  if (current === "/admin/settings") return <AdminSettings text={text} onUnauthorized={onUnauthorized}/>;
  return <NotFound text={text}/>;
}

class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl(path), { ...init, credentials: "include" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : "The administrator request could not be completed.";
    throw new AdminApiError(message, response.status);
  }
  if (!body || typeof body !== "object") throw new Error("The administrator API response was invalid.");
  return body as Record<string, unknown>;
}

function AdminCategories({ text, onUnauthorized }: CopyProps & { onUnauthorized: () => void }) {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [query, setQuery] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    adminFetch(`/api/admin/categories?${params}`, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data.categories)) throw new Error("The category response was invalid.");
        const rows = data.categories.filter((value): value is AdminCategory =>
          !!value && typeof value === "object" && "id" in value && typeof value.id === "string" &&
          "name" in value && typeof value.name === "string" && "slug" in value && typeof value.slug === "string"
        );
        setCategories(rows);
      })
      .catch(reason => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
        setError(reason instanceof Error ? reason.message : text.adminWorkspaceLoadError);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, refreshKey, onUnauthorized, text.adminWorkspaceLoadError]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const data = await adminFetch(editingId
        ? `/api/admin/categories/${encodeURIComponent(editingId)}`
        : "/api/admin/categories", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName })
      });
      if (!data.category || typeof data.category !== "object" || !("id" in data.category) ||
          typeof data.category.id !== "string" || !("name" in data.category) || typeof data.category.name !== "string") {
        throw new Error("The saved category response was invalid.");
      }
      setCategoryName("");
      setEditingId(null);
      setFormOpen(false);
      setNotice(text.adminStatusUpdated);
      setRefreshKey(value => value + 1);
      notifyProductsChanged();
    } catch (reason) {
      if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
      setError(reason instanceof Error ? reason.message : text.adminWorkspaceSaveError);
    } finally {
      setSaving(false);
    }
  };

  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.admin}</Eyebrow><h1>{text.adminNav[3]}</h1></div>
      <button className="button button-primary" type="button" onClick={() => { setEditingId(null); setCategoryName(""); setFormOpen(true); setError(""); setNotice(""); }}><Plus size={16}/>{text.adminCategoryAdd}</button>
    </div>
    <p className="notice"><Tags size={17}/>{text.adminCategoriesIntro}</p>
    <div className="admin-toolbar">
      <label className="admin-search-field"><Search size={16}/><input aria-label={text.adminCategorySearch} placeholder={text.adminCategorySearch} value={query} maxLength={100} onChange={event => setQuery(event.target.value)}/></label>
      <button className="button button-quiet" type="button" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}><RotateCw size={15}/>{text.adminRefresh}</button>
    </div>
    {formOpen && <form className="admin-workspace-form" onSubmit={event => void submit(event)}>
      <label>{text.adminCategoryName}<input required minLength={1} maxLength={120} value={categoryName} onChange={event => setCategoryName(event.target.value)} autoFocus/></label>
      <div className="admin-workspace-actions">
        <button className="button button-primary" type="submit" disabled={saving || !categoryName.trim()}><Check size={15}/>{saving ? text.adminSigningIn : editingId ? text.adminCategorySave : text.adminCategoryAdd}</button>
        <button className="button button-quiet" type="button" disabled={saving} onClick={() => { setEditingId(null); setCategoryName(""); setFormOpen(false); setError(""); }}>{text.adminBackToProducts}</button>
      </div>
    </form>}
    {notice && <p className="admin-workspace-message success" role="status">{notice}</p>}
    {error && <div className="admin-state-panel error" role="alert">{error}<button className="button button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)}>{text.adminErrorRetry}</button></div>}
    {loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminWorkspaceLoading}</div>
      : !error && categories.length === 0 ? <div className="admin-state-panel">{text.adminCategoryEmpty}</div>
        : !error && <div className="admin-table-wrap"><table><thead><tr><th>{text.adminCategoryName}</th><th>{text.adminColumns[5]}</th><th>{text.adminColumns[6]}</th><th>{text.adminDetails}</th></tr></thead>
          <tbody>{categories.map(category => <tr key={category.id}>
            <td data-label={text.adminCategoryName}><strong>{category.name}</strong></td><td data-label={text.adminColumns[5]}>{category.slug}</td>
            <td data-label={text.adminColumns[6]}>{typeof category.product_count === "number" ? category.product_count : "—"}</td>
            <td data-label={text.adminDetails}><button className="admin-row-link" type="button" onClick={() => { setEditingId(category.id); setCategoryName(category.name); setFormOpen(true); setNotice(""); setError(""); }}><Pencil size={14}/>{text.adminCategoryEdit}</button></td>
          </tr>)}</tbody></table></div>}
    <p className="admin-workspace-hint">{text.adminCategoryNoDelete}</p>
  </section>;
}

type EnquiryKind = "vehicle" | "contact";
type EnquiryRecord = Record<string, unknown>;

function displayEnquiryValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}

function enquiryStatusLabel(status: string, text: CopyProps["text"]): string {
  const labels: Record<string, string> = {
    new: text.adminStatusNew, contacted: text.adminStatusContacted,
    inspection_scheduled: text.adminStatusInspection, price_discussed: text.adminStatusPrice,
    completed: text.adminStatusCompleted, rejected: text.adminStatusRejected
  };
  return labels[status] ?? status;
}

function AdminEnquiries({ text, kind, onUnauthorized }: CopyProps & { kind: EnquiryKind; onUnauthorized: () => void }) {
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [selected, setSelected] = useState<EnquiryRecord | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const vehicle = kind === "vehicle";
  const base = vehicle ? "/api/admin/vehicle-enquiries" : "/api/admin/contact-enquiries";
  const title = vehicle ? text.adminNav[4] : text.adminNav[5];
  const statuses = vehicle
    ? ["new", "contacted", "inspection_scheduled", "price_discussed", "completed", "rejected"]
    : ["new", "contacted", "completed", "rejected"];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    if (query.trim()) params.set("search", query.trim());
    if (status) params.set("status", status);
    adminFetch(`${base}?${params}`, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data.enquiries)) throw new Error("The enquiry response was invalid.");
        setEnquiries(data.enquiries.filter((item): item is EnquiryRecord =>
          !!item && typeof item === "object" && "id" in item && typeof item.id === "string" &&
          "customer_name" in item && typeof item.customer_name === "string"
        ));
      })
      .catch(reason => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
        setError(reason instanceof Error ? reason.message : text.adminWorkspaceLoadError);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base, query, status, offset, refreshKey, onUnauthorized, text.adminWorkspaceLoadError]);

  const updateStatus = async (id: string, nextStatus: string) => {
    setUpdatingId(id);
    setActionError("");
    setNotice("");
    try {
      const data = await adminFetch(`${base}/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!data.enquiry || typeof data.enquiry !== "object" ||
          !("id" in data.enquiry) || data.enquiry.id !== id ||
          !("status" in data.enquiry) || data.enquiry.status !== nextStatus) {
        throw new Error("The updated enquiry response was invalid.");
      }
      setNotice(text.adminCategorySaved);
      setRefreshKey(value => value + 1);
      if (selected?.id === id) setSelected({ ...selected, status: nextStatus });
    } catch (reason) {
      if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
      setActionError(reason instanceof Error ? reason.message : text.adminWorkspaceSaveError);
    } finally {
      setUpdatingId("");
    }
  };

  const openDetails = async (id: string) => {
    setSelected(null);
    setActionError("");
    setDetailLoading(true);
    try {
      const data = await adminFetch(`${base}/${encodeURIComponent(id)}`);
      if (!data.enquiry || typeof data.enquiry !== "object" || !("id" in data.enquiry) || data.enquiry.id !== id) {
        throw new Error("The enquiry detail response was invalid.");
      }
      setSelected(data.enquiry as EnquiryRecord);
    } catch (reason) {
      if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
      setActionError(reason instanceof Error ? reason.message : text.adminWorkspaceLoadError);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailFields: Array<[string, string]> = vehicle
    ? [["customer_name", text.adminColumns[7]], ["mobile_number", text.adminColumns[10]], ["vehicle_category", text.adminColumns[8]], ["make_name", text.adminMakeField],
      ["model_name", text.adminModelField], ["manufacturing_year", text.fieldYear], ["fuel_type", text.fieldVariant],
      ["registration_region", text.adminColumns[9]], ["vehicle_condition", text.adminConditionField], ["known_damage", text.adminColumns[11]],
      ["approximate_location", text.adminColumns[9]], ["expected_price", text.adminPriceField], ["additional_notes", text.adminColumns[11]],
      ["admin_notes", text.admin], ["final_inspection_findings", text.adminVehicleDetails]]
    : [["customer_name", text.adminColumns[7]], ["mobile_number", text.adminColumns[10]], ["email", "Email"],
      ["message", text.adminColumns[11]], ["admin_notes", text.admin], ["created_at", text.adminColumns[12]]];

  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.admin}</Eyebrow><h1>{title}</h1></div>
      <button className="button button-quiet" type="button" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}><RotateCw size={15}/>{text.adminRefresh}</button>
    </div>
    <div className="admin-toolbar">
      <label className="admin-search-field"><Search size={16}/><input aria-label={text.adminSearchEnquiries} placeholder={text.adminSearchEnquiries} value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setOffset(0); }}/></label>
      <label className="admin-workspace-select"><span className="sr-only">{text.adminFilterStatus}</span><select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}>
        <option value="">{text.adminFilterStatus}</option>{statuses.map(value => <option value={value} key={value}>{enquiryStatusLabel(value, text)}</option>)}
      </select></label>
    </div>
    {notice && <p className="admin-workspace-message success" role="status">{notice}</p>}
    {actionError && <p className="admin-workspace-message error" role="alert">{actionError}</p>}
    {error ? <div className="admin-state-panel error" role="alert">{error}<button className="button button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)}>{text.adminErrorRetry}</button></div>
      : loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminWorkspaceLoading}</div>
        : enquiries.length === 0 ? <div className="admin-state-panel">{text.adminNoEnquiries}</div>
          : <div className="admin-table-wrap"><table><thead><tr><th>{text.adminColumns[7]}</th><th>{text.adminColumns[10]}</th><th>{vehicle ? text.adminColumns[8] : text.adminColumns[11]}</th><th>{text.adminColumns[12]}</th><th>{text.adminColumns[4]}</th><th>{text.adminDetails}</th></tr></thead>
            <tbody>{enquiries.map(enquiry => {
              const id = displayEnquiryValue(enquiry.id);
              const currentStatus = typeof enquiry.status === "string" ? enquiry.status : "new";
              return <tr key={id}>
                <td data-label={text.adminColumns[7]}><strong>{displayEnquiryValue(enquiry.customer_name)}</strong></td>
                <td data-label={text.adminColumns[10]}>{displayEnquiryValue(enquiry.mobile_number)}{typeof enquiry.email === "string" ? <><br/>{enquiry.email}</> : null}</td>
                <td data-label={vehicle ? text.adminColumns[8] : text.adminColumns[11]}>{vehicle ? `${displayEnquiryValue(enquiry.make_name)} ${displayEnquiryValue(enquiry.model_name)}` : displayEnquiryValue(enquiry.message)}</td>
                <td data-label={text.adminColumns[12]}>{displayEnquiryValue(enquiry.created_at)}</td>
                <td data-label={text.adminColumns[4]}><select aria-label={text.adminUpdateStatus} value={currentStatus} disabled={updatingId === id} onChange={event => void updateStatus(id, event.target.value)}>
                  {statuses.map(value => <option key={value} value={value}>{enquiryStatusLabel(value, text)}</option>)}
                </select></td>
                <td data-label={text.adminDetails}><button className="admin-row-link" type="button" disabled={detailLoading} onClick={() => void openDetails(id)}>{text.adminViewEnquiry}<ArrowRight size={14}/></button></td>
              </tr>;
            })}</tbody></table></div>}
    {!loading && enquiries.length > 0 && <div className="admin-workspace-pagination">
      <button className="button button-quiet" type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}><ArrowLeft size={14}/>{text.previous}</button>
      <span>{Math.floor(offset / 50) + 1}</span>
      <button className="button button-quiet" type="button" disabled={enquiries.length < 50} onClick={() => setOffset(value => value + 50)}>{text.next}<ArrowRight size={14}/></button>
    </div>}
    {detailLoading && <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminWorkspaceLoading}</div>}
    {selected && <section className="admin-enquiry-detail">
      <div className="admin-module-heading"><div><Eyebrow>{text.adminDetails}</Eyebrow><h2>{displayEnquiryValue(selected.customer_name)}</h2></div>
        <button className="button button-quiet" type="button" onClick={() => setSelected(null)}><X size={15}/>{text.remove}</button>
      </div>
      <dl className="admin-detail-list">{detailFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{displayEnquiryValue(selected[key])}</dd></div>)}</dl>
      {vehicle && Array.isArray(selected.image_paths) && selected.image_paths.length > 0 && <div className="admin-enquiry-images"><strong>{text.adminEnquiryImages}</strong>{selected.image_paths.map((path, index) => <p key={`${String(path)}-${index}`}>{displayEnquiryValue(path)}</p>)}</div>}
      <label className="admin-workspace-select">{text.adminUpdateStatus}<select value={typeof selected.status === "string" ? selected.status : "new"} disabled={updatingId === displayEnquiryValue(selected.id)} onChange={event => void updateStatus(displayEnquiryValue(selected.id), event.target.value)}>
        {statuses.map(value => <option key={value} value={value}>{enquiryStatusLabel(value, text)}</option>)}
      </select></label>
    </section>}
  </section>;
}

function AdminReports({ text, onUnauthorized }: CopyProps & { onUnauthorized: () => void }) {
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    adminFetch("/api/admin/reports", { signal: controller.signal })
      .then(data => {
        if (!data.metrics || typeof data.metrics !== "object") throw new Error("The report response was invalid.");
        setMetrics(data.metrics as Record<string, unknown>);
      })
      .catch(reason => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
        setError(reason instanceof Error ? reason.message : text.adminWorkspaceLoadError);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, onUnauthorized, text.adminWorkspaceLoadError]);

  const metricCards: Array<[string, string]> = [
    ["total_products", text.adminTotalProducts], ["active_products", text.adminActiveProducts],
    ["inactive_products", text.adminInactiveProducts], ["categories_count", text.adminCategoriesCount],
    ["vehicle_enquiries_count", text.adminVehicleEnquiriesCount], ["contact_enquiries_count", text.adminContactEnquiriesCount],
    ["total_stock", text.adminTotalStock], ["out_of_stock_products", text.adminOutOfStock]
  ];
  const numberFor = (key: string): number | null => {
    const value = metrics?.[key];
    const number = typeof value === "number" ? value : Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  const downloadCsv = () => {
    if (!metrics) return;
    const rows = [["Metric", "Value"], ...metricCards.map(([key, label]) => [label, String(numberFor(key) ?? "")])];
    const csv = rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `marketplace-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.admin}</Eyebrow><h1>{text.adminNav[6]}</h1></div>
      <div className="admin-workspace-actions">
        {metrics && <button className="button button-primary" type="button" onClick={downloadCsv}><FileBarChart2 size={15}/>{text.adminDownloadCsv}</button>}
        <button className="button button-quiet" type="button" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}><RotateCw size={15}/>{text.adminRefresh}</button>
      </div>
    </div>
    <p className="notice"><FileBarChart2 size={17}/>{text.adminReportsIntro}</p>
    {error ? <div className="admin-state-panel error" role="alert">{error}<button className="button button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)}>{text.adminErrorRetry}</button></div>
      : loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminWorkspaceLoading}</div>
        : metrics && <div className="admin-report-grid">{metricCards.map(([key, label]) => <article className="admin-stat" key={key}>
          <span>{label}</span><strong>{numberFor(key) === null ? "—" : new Intl.NumberFormat().format(numberFor(key)!)}</strong>
        </article>)}</div>}
  </section>;
}

function AdminSettings({ text, onUnauthorized }: CopyProps & { onUnauthorized: () => void }) {
  const publicSettings = useContext(MarketplaceSettingsContext);
  const [settings, setSettings] = useState(publicSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    adminFetch("/api/admin/settings", { signal: controller.signal })
      .then(data => {
        if (data.settings === null) {
          setSettings(defaultMarketplaceSettings);
        } else if (validMarketplaceSettings(data.settings)) {
          setSettings(data.settings);
        } else {
          throw new Error("Saved marketplace settings are invalid.");
        }
      })
      .catch(reason => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
        setError(reason instanceof Error ? reason.message : text.adminWorkspaceLoadError);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, onUnauthorized, text.adminWorkspaceLoadError]);

  const update = (field: keyof MarketplaceSettings, value: string) => setSettings(current => ({ ...current, [field]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (!validMarketplaceSettings(data.settings)) throw new Error("The saved settings response was invalid.");
      setSettings(data.settings);
      setNotice(text.adminSettingsSaved);
      window.dispatchEvent(new Event("reparts:settings-changed"));
    } catch (reason) {
      if (reason instanceof AdminApiError && reason.status === 401) onUnauthorized();
      setError(reason instanceof Error ? reason.message : text.adminWorkspaceSaveError);
    } finally {
      setSaving(false);
    }
  };

  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.admin}</Eyebrow><h1>{text.adminNav[7]}</h1></div>
      <button className="button button-quiet" type="button" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}><RotateCw size={15}/>{text.adminRefresh}</button>
    </div>
    <p className="notice"><SettingsIcon size={17}/>{text.adminSettingsIntro}</p>
    {notice && <p className="admin-workspace-message success" role="status">{notice}</p>}
    {loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminWorkspaceLoading}</div>
      : error ? <div className="admin-state-panel error" role="alert">{error}
        <button className="button button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)}>{text.adminErrorRetry}</button>
      </div> : <form className="admin-settings-form" onSubmit={event => void save(event)}>
        <label>{text.adminMarketplaceName}<input required maxLength={120} value={settings.marketplaceName} onChange={event => update("marketplaceName", event.target.value)}/></label>
        <label>{text.adminBusinessAddress}<textarea maxLength={300} rows={3} value={settings.address} onChange={event => update("address", event.target.value)}/></label>
        <label>{text.adminContactPhone}<input type="tel" maxLength={24} value={settings.contactPhone} onChange={event => update("contactPhone", event.target.value)}/></label>
        <label>{text.adminWhatsappNumber}<input type="tel" maxLength={24} value={settings.whatsappNumber} onChange={event => update("whatsappNumber", event.target.value)}/></label>
        <p className="admin-compatibility-note">{text.adminPublicSettingsNote}</p>
        <div className="admin-workspace-actions"><button className="button button-primary" type="submit" disabled={saving || loading}><Check size={15}/>{saving ? text.adminSigningIn : text.adminSettingsSave}</button></div>
      </form>}
  </section>;
}

type AdminCategory = { id: string; name: string; slug: string; product_count?: number };
type AdminProductDraft = {
  name: string;
  description: string;
  partNumber: string;
  categoryId: string;
  condition: Product["condition"] | "";
  priceType: Product["price_type"];
  price: string;
  stock: string;
  imageUrls: string;
  knownDefects: string;
  isActive: boolean;
  compatibility: Array<{ modelId: string; verificationStatus: "verified" | "unverified"; notes: string | null }>;
};

const emptyAdminDraft: AdminProductDraft = {
  name: "", description: "", partNumber: "", categoryId: "", condition: "",
  priceType: "enquiry", price: "", stock: "", imageUrls: "",
  knownDefects: "", isActive: false, compatibility: []
};

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return typeof product.id === "string" && typeof product.name === "string" &&
    (product.price === null || typeof product.price === "string") &&
    (product.price_type === "fixed" || product.price_type === "enquiry") &&
    ["excellent", "good", "fair", "poor", "unassessed"].includes(String(product.condition)) &&
    typeof product.quantity_available === "number" && Number.isSafeInteger(product.quantity_available) && product.quantity_available >= 0 &&
    typeof product.category === "string" &&
    (product.image_path === null || typeof product.image_path === "string") &&
    (product.image_paths === undefined || (Array.isArray(product.image_paths) && product.image_paths.every(path => typeof path === "string"))) &&
    (product.compatible_vehicles === undefined || (Array.isArray(product.compatible_vehicles) && product.compatible_vehicles.every(vehicle => typeof vehicle === "string"))) &&
    (product.category_id === undefined || typeof product.category_id === "string") &&
    (product.category_slug === undefined || typeof product.category_slug === "string") &&
    (product.is_active === undefined || typeof product.is_active === "boolean") &&
    (product.compatibility === undefined || (Array.isArray(product.compatibility) && product.compatibility.every(item =>
      !!item && typeof item === "object" && "modelId" in item && typeof item.modelId === "string" &&
      "verificationStatus" in item && (item.verificationStatus === "verified" || item.verificationStatus === "unverified") &&
      "make" in item && typeof item.make === "string" && "model" in item && typeof item.model === "string"
    )));
}

function notifyProductsChanged() {
  window.dispatchEvent(new Event("reparts:products-changed"));
}

async function readCategories(): Promise<AdminCategory[]> {
  const response = await fetch(apiUrl("/api/categories"));
  if (!response.ok) throw new Error("Category request failed.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("categories" in data) || !Array.isArray(data.categories)) {
    throw new Error("Category response was invalid.");
  }
  return data.categories.flatMap((value): AdminCategory[] => {
    if (!value || typeof value !== "object") return [];
    const category = value as Record<string, unknown>;
    return typeof category.id === "string" && typeof category.name === "string" && typeof category.slug === "string"
      ? [{ id: category.id, name: category.name, slug: category.slug }]
      : [];
  });
}

function AdminOverview({ text }: CopyProps) {
  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.admin}</Eyebrow><h1>{text.adminNav[0]}</h1></div><span className="pending-badge">{text.adminSecurityNotice}</span></div>
    <p className="notice"><ShieldCheck size={17}/>{text.adminWorkspaceSummary}</p>
    <div className="admin-overview-grid">
      <Link className="admin-overview-card" to="/admin/products"><PackageSearch/><span>{text.adminNav[1]}</span><small>{text.adminProductsIntro}</small></Link>
      <Link className="admin-overview-card" to="/admin/products/new"><Plus/><span>{text.addProduct}</span><small>{text.adminFormCreateIntro}</small></Link>
      <Link className="admin-overview-card" to="/admin/categories"><Tags/><span>{text.adminNav[3]}</span><small>{text.adminCategoriesIntro}</small></Link>
      <Link className="admin-overview-card" to="/admin/vehicle-enquiries"><Bike/><span>{text.adminNav[4]}</span><small>{text.adminSearchEnquiries}</small></Link>
      <Link className="admin-overview-card" to="/admin/contact-enquiries"><MessageCircle/><span>{text.adminNav[5]}</span><small>{text.adminSearchEnquiries}</small></Link>
      <Link className="admin-overview-card" to="/admin/reports"><FileBarChart2/><span>{text.adminNav[6]}</span><small>{text.adminReportsIntro}</small></Link>
      <Link className="admin-overview-card" to="/admin/settings"><SettingsIcon/><span>{text.adminNav[7]}</span><small>{text.adminSettingsIntro}</small></Link>
      <article className="admin-overview-card"><FileImage/><span>{text.productImages}</span><small>{text.adminImageNotice}</small></article>
    </div>
  </section>;
}

function AdminProductList({ text, onUnauthorized }: CopyProps & { onUnauthorized: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const state = location.state;
    if (state && typeof state === "object" && "notice" in state && typeof state.notice === "string") {
      setNotice(state.notice);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const refresh = () => setRefreshKey(value => value + 1);
    window.addEventListener("reparts:products-changed", refresh);
    return () => window.removeEventListener("reparts:products-changed", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setCategoryError(false);
    readCategories().then(items => { if (active) setCategories(items); })
      .catch(() => { if (active) setCategoryError(true); });
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ sort: "newest", limit: "12", offset: String(page * 12) });
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (categoryFilter) params.set("category", categoryFilter);
    setLoading(true);
    setError(false);
    fetch(`${apiUrl("/api/admin/products")}?${params}`, { signal: controller.signal, credentials: "include" })
      .then(async response => {
        if (response.status === 401) {
          onUnauthorized();
          throw new Error("Admin session expired.");
        }
        if (!response.ok) throw new Error("Product listing request failed.");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("products" in data) || !Array.isArray(data.products) ||
            !data.products.every(isProduct) || !("hasMore" in data) || typeof data.hasMore !== "boolean") {
          throw new Error("Product listing response was invalid.");
        }
        return { items: data.products as Product[], more: data.hasMore };
      })
      .then(({ items, more }) => {
        if (!controller.signal.aborted) {
          setProducts(items);
          setHasMore(more);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, debouncedQuery, categoryFilter, page, onUnauthorized]);

  const stockTotal = products.reduce((total, product) => total + product.quantity_available, 0);

  return <section className="admin-module">
    <div className="admin-module-heading">
      <div><Eyebrow>{text.admin}</Eyebrow><h1>{text.adminProductList}</h1></div>
      <Link className="button button-primary" to="/admin/products/new"><Plus size={16}/>{text.addProduct}</Link>
    </div>
    <p className="notice"><PackageSearch size={17}/>{text.adminProductsIntro}</p>
    {notice && <p className="admin-success-banner" role="status"><Check size={16}/>{notice}</p>}
    <div className="admin-readonly-summary">
      <div><span>{text.adminAvailableListings}</span><strong>{loading || error ? "—" : products.length}</strong></div>
      <div><span>{text.adminStockSnapshot}</span><strong>{loading || error ? "—" : stockTotal}</strong></div>
      <span className="pending-badge">{text.adminReadOnly}</span>
    </div>
    <div className="admin-toolbar">
      <label className="admin-search-field"><Search size={16}/><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} aria-label={text.adminSearchProducts} placeholder={text.adminSearchProducts}/></label>
      <label className="admin-category-field"><span className="sr-only">{text.adminCategoryAll}</span><select value={categoryFilter} onChange={event => { setCategoryFilter(event.target.value); setPage(0); }} disabled={categoryError}>
        <option value="">{text.adminCategoryAll}</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label>
      <button className="button button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RotateCw size={15}/>{text.adminRefresh}</button>
    </div>
    {categoryError && <p className="admin-category-error" role="status">{text.adminCategoriesUnavailable}</p>}
    {loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminProductsLoading}</div>
      : error ? <div className="admin-state-panel error" role="alert">{text.adminProductsError}<button type="button" className="button button-quiet" onClick={() => setRefreshKey(value => value + 1)}>{text.adminRefresh}</button></div>
        : products.length === 0 && (debouncedQuery || categoryFilter) ? <div className="admin-state-panel">{text.adminNoMatches}</div>
          : products.length === 0 ? <div className="admin-state-panel">{text.adminProductsEmpty}</div>
            : <>
              <div className="admin-table-wrap admin-products-table">
                <table><thead><tr><th>{text.adminNameField}</th><th>{text.adminCategoryField}</th><th>{text.adminCondition}</th><th>{text.adminPriceField}</th><th>{text.adminStockField}</th><th>{text.adminDetails}</th></tr></thead>
                  <tbody>{products.map(product => <tr key={product.id}>
                    <td data-label={text.adminNameField}><span className="admin-product-cell">{product.image_path ? <img src={product.image_path} alt="" loading="lazy"/> : <span className="admin-product-placeholder"><PackageSearch size={17}/></span>}<strong>{product.name}</strong></span></td>
                    <td data-label={text.adminCategoryField}>{product.category}</td>
                    <td data-label={text.adminCondition}>{conditionLabel(product.condition, text)}</td>
                    <td data-label={text.adminPriceField}>{product.price_type === "fixed" && product.price !== null ? `₹${product.price}` : text.adminNoPrice}</td>
                    <td data-label={text.adminStockField}>{product.quantity_available}</td>
                    <td data-label={text.adminDetails}><Link className="admin-row-link" to={`/admin/products/${product.id}`}>{text.adminDetails}<ArrowRight size={14}/></Link></td>
                  </tr>)}</tbody>
                </table>
              </div>
              {(page > 0 || hasMore) && <div className="pagination">
                <button disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}><ArrowLeft size={15}/>{text.previous}</button>
                <span>{text.page} {page + 1}</span>
                <button disabled={!hasMore} onClick={() => setPage(value => value + 1)}>{text.next}<ArrowRight size={15}/></button>
              </div>}
            </>}
  </section>;
}

function AdminProductDetails({ text, productId, onUnauthorized }: CopyProps & { productId: string; onUnauthorized: () => void }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    setProduct(null);
    setError(false);
    setLoading(true);
    fetch(apiUrl(`/api/admin/products/${encodeURIComponent(productId)}`), { signal: controller.signal, credentials: "include" })
      .then(async response => {
        if (response.status === 401) {
          onUnauthorized();
          throw new Error("Admin session expired.");
        }
        if (!response.ok) throw new Error("Product details unavailable.");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("product" in data) || !isProduct(data.product)) {
          throw new Error("Invalid product response.");
        }
        return data.product;
      })
      .then(item => { if (!controller.signal.aborted) setProduct(item); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productId, onUnauthorized]);

  const archive = async () => {
    if (!window.confirm(text.adminArchiveConfirm)) return;
    setArchiveError("");
    setArchiving(true);
    try {
      const response = await fetch(apiUrl(`/api/admin/products/${encodeURIComponent(productId)}`), {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error : text.adminArchiveFailed;
        setArchiveError(message);
        return;
      }
      notifyProductsChanged();
      navigate("/admin/products", { replace: true, state: { notice: text.adminArchived } });
    } catch {
      setArchiveError(text.adminArchiveFailed);
    } finally {
      setArchiving(false);
    }
  };

  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.adminProductList}</Eyebrow><h1>{text.adminDetails}</h1></div><Link className="button button-quiet" to="/admin/products"><ArrowLeft size={15}/>{text.adminBackToProducts}</Link></div>
    {loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminProductsLoading}</div>
      : error || !product ? <div className="admin-state-panel error" role="alert">{text.adminNotFound}</div>
        : <article className="admin-product-detail">
          <AdminProductGallery product={product} text={text}/>
          <div className="admin-detail-content">
            <p className="notice"><PackageSearch size={16}/>{product.is_active ? text.adminActive : text.adminInactive}</p>
            <h2>{product.name}</h2>
            <p>{product.description || text.adminNoCompatibility}</p>
            <dl className="admin-detail-list">
              <div><dt>{text.adminCategoryField}</dt><dd>{product.category}</dd></div>
              <div><dt>{text.adminCondition}</dt><dd>{conditionLabel(product.condition, text)}</dd></div>
              <div><dt>{text.adminPriceField}</dt><dd>{product.price_type === "fixed" && product.price !== null ? `₹${product.price}` : text.adminNoPrice}</dd></div>
              <div><dt>{text.adminStockField}</dt><dd>{product.quantity_available}</dd></div>
              <div><dt>{text.fieldCompatibility}</dt><dd>{product.compatible_vehicles?.length ? product.compatible_vehicles.join(", ") : text.adminNoCompatibility}</dd></div>
              {product.part_number && <div><dt>{text.adminPartNumberField}</dt><dd>{product.part_number}</dd></div>}
              {product.known_defects && <div><dt>{text.knownDefects}</dt><dd>{product.known_defects}</dd></div>}
            </dl>
            <div className="admin-detail-actions">
              <Link className="button button-primary" to={`/admin/products/${product.id}/edit`}><Pencil size={15}/>{text.adminEdit}</Link>
              <Link className="button button-quiet" to={`/parts/${product.id}`} target="_blank" rel="noreferrer">{text.adminViewPublicListing}<ArrowRight size={15}/></Link>
              <button className="button button-danger" type="button" disabled={archiving} onClick={() => void archive()}><Trash2 size={15}/>{archiving ? text.adminSigningIn : text.adminArchive}</button>
            </div>
            {archiveError && <p className="form-status error" role="alert">{archiveError}</p>}
          </div>
        </article>}
  </section>;
}

function AdminProductForm({ text, productId, onUnauthorized }: CopyProps & { productId?: string; onUnauthorized: () => void }) {
  const [draft, setDraft] = useState<AdminProductDraft>(emptyAdminDraft);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [vehicleModels, setVehicleModels] = useState<AdminVehicleModel[]>([]);
  const [loading, setLoading] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [localPreview, setLocalPreview] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      setLoading(Boolean(productId));
      setLoadError(false);
      setDraft(emptyAdminDraft);
      const [categoryResult, modelResult, productResult] = await Promise.allSettled([
        readCategories(),
        fetch(apiUrl("/api/admin/vehicle-models"), { credentials: "include", signal: controller.signal })
          .then(async response => {
            if (response.status === 401) {
              onUnauthorized();
              throw new Error("Admin session expired.");
            }
            if (!response.ok) throw new Error("Vehicle models unavailable.");
            const data: unknown = await response.json();
            if (!data || typeof data !== "object" || !("models" in data) || !Array.isArray(data.models)) throw new Error("Invalid vehicle model response.");
            return data.models.flatMap((item): AdminVehicleModel[] => {
              if (!item || typeof item !== "object") return [];
              const model = item as Record<string, unknown>;
              return typeof model.id === "string" && typeof model.make === "string" && typeof model.model === "string"
                ? [{ id: model.id, make: model.make, model: model.model,
                    model_year_start: typeof model.model_year_start === "number" ? model.model_year_start : null,
                    model_year_end: typeof model.model_year_end === "number" ? model.model_year_end : null }]
                : [];
            });
          }),
        productId
          ? fetch(apiUrl(`/api/admin/products/${encodeURIComponent(productId)}`), { credentials: "include", signal: controller.signal }).then(async response => {
              if (response.status === 401) {
                onUnauthorized();
                throw new Error("Admin session expired.");
              }
              if (!response.ok) throw new Error("Product details unavailable.");
              const data: unknown = await response.json();
              if (!data || typeof data !== "object" || !("product" in data) || !isProduct(data.product)) {
                throw new Error("Invalid product response.");
              }
              return data.product;
            })
          : Promise.resolve(null)
      ]);
      if (!active) return;
      if (categoryResult.status === "fulfilled") setCategories(categoryResult.value);
      if (modelResult.status === "fulfilled") setVehicleModels(modelResult.value);
      if (productId && productResult.status === "fulfilled" && productResult.value) {
        const product = productResult.value;
        setDraft({
          ...emptyAdminDraft,
          name: product.name,
          description: product.description ?? "",
          partNumber: product.part_number ?? "",
          categoryId: product.category_id ?? "",
          condition: product.condition as Product["condition"],
          priceType: product.price_type,
          price: product.price === null ? "" : String(product.price),
          stock: String(product.quantity_available),
          imageUrls: (product.image_paths ?? (product.image_path ? [product.image_path] : [])).join("\n"),
          knownDefects: product.known_defects ?? "",
          isActive: product.is_active ?? false,
          compatibility: (product.compatibility ?? []).map(item => ({
            modelId: item.modelId,
            verificationStatus: item.verificationStatus,
            notes: item.notes ?? null
          }))
        });
      } else if (productId && productResult.status === "rejected") {
        setLoadError(true);
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [productId, onUnauthorized]);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreview("");
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const change = (field: keyof AdminProductDraft, value: string | boolean) => {
    setDraft(current => ({ ...current, [field]: value }));
    setFormError("");
  };

  const toggleCompatibility = (modelId: string, checked: boolean) => {
    setDraft(current => ({
      ...current,
      compatibility: checked
        ? [...current.compatibility, { modelId, verificationStatus: "unverified", notes: null }]
        : current.compatibility.filter(item => item.modelId !== modelId)
    }));
    setFormError("");
  };

  const setCompatibilityVerification = (modelId: string, verificationStatus: "verified" | "unverified") => {
    setDraft(current => ({
      ...current,
      compatibility: current.compatibility.map(item => item.modelId === modelId ? { ...item, verificationStatus } : item)
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return setFormError(text.adminValidationName);
    if (!draft.categoryId) return setFormError(text.adminValidationCategory);
    if (!draft.condition) return setFormError(text.adminValidationCondition);
    if ((draft.priceType === "fixed" && !draft.price.trim()) ||
        (draft.price.trim() && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0))) {
      return setFormError(text.adminValidationPrice);
    }
    if (!draft.stock.trim() || !/^\d+$/.test(draft.stock) || !Number.isSafeInteger(Number(draft.stock))) {
      return setFormError(text.adminValidationStock);
    }
    if (selectedFile) return setFormError(text.adminImageUploadUnavailable);
    const imageUrls = draft.imageUrls.split(/\r?\n/).map(url => url.trim()).filter(Boolean);
    for (const imageUrl of imageUrls) {
      try {
        const url = new URL(imageUrl);
        if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return setFormError(text.adminValidationImageUrl);
      } catch {
        return setFormError(text.adminValidationImageUrl);
      }
    }
    setFormError("");
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        partNumber: draft.partNumber.trim() || null,
        categoryId: draft.categoryId,
        condition: draft.condition,
        knownDefects: draft.knownDefects.trim() || null,
        price: draft.price.trim() ? Number(draft.price) : null,
        priceType: draft.priceType,
        quantityAvailable: Number(draft.stock),
        isActive: draft.isActive,
        imageUrls,
        compatibility: draft.compatibility
      };
      const response = await fetch(apiUrl(productId ? `/api/admin/products/${encodeURIComponent(productId)}` : "/api/admin/products"), {
        method: productId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error : text.adminSaveFailed;
        setFormError(message);
        return;
      }
      if (!data || typeof data !== "object" || !("product" in data) || !isProduct(data.product)) {
        setFormError(text.adminSaveFailed);
        return;
      }
      notifyProductsChanged();
      navigate("/admin/products", { replace: true, state: { notice: text.adminSaved } });
    } catch {
      setFormError(text.adminSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const conditionOptions: Product["condition"][] = ["excellent", "good", "fair", "poor", "unassessed"];
  const imageUrls = draft.imageUrls.split(/\r?\n/).map(url => url.trim()).filter(Boolean);
  const preview = localPreview || imageUrls[0] || "";
  const pageTitle = productId ? text.adminEditProduct : text.addProduct;
  return <section className="admin-module">
    <div className="admin-module-heading"><div><Eyebrow>{text.adminProductList}</Eyebrow><h1>{pageTitle}</h1></div><Link className="button button-quiet" to="/admin/products"><ArrowLeft size={15}/>{text.adminBackToProducts}</Link></div>
    <p className="notice"><ShieldCheck size={17}/>{text.adminNotAdminSystem} {productId ? text.adminFormEditIntro : text.adminFormCreateIntro}</p>
    {loading ? <div className="admin-state-panel" role="status"><span className="loader"/>{text.adminProductsLoading}</div>
      : loadError ? <div className="admin-state-panel error" role="alert">{text.adminProductLoadError}</div>
        : <form className="admin-product-form" onSubmit={event => void submit(event)} noValidate>
          <div className="admin-form-fields">
            <label>{text.adminNameField}<input value={draft.name} maxLength={200} onChange={event => change("name", event.target.value)} required/></label>
            <label>{text.adminCategoryField}<select value={draft.categoryId} onChange={event => change("categoryId", event.target.value)} required>
              <option value="">{text.selectOption}</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
            <label>{text.adminCondition}<select value={draft.condition} onChange={event => change("condition", event.target.value)} required>
              <option value="">{text.selectOption}</option>{conditionOptions.map(condition => <option key={condition} value={condition}>{conditionLabel(condition, text)}</option>)}
            </select></label>
            <label>{text.adminPartNumberField}<input value={draft.partNumber} maxLength={100} onChange={event => change("partNumber", event.target.value)}/></label>
            <label>{text.adminPriceType}<select value={draft.priceType} onChange={event => change("priceType", event.target.value)}>
              <option value="enquiry">{text.adminEnquiryPrice}</option><option value="fixed">{text.adminFixedPrice}</option>
            </select></label>
            <label>{text.adminPriceField}<input type="number" min="0" step="0.01" inputMode="decimal" value={draft.price} onChange={event => change("price", event.target.value)} placeholder={text.adminNoPrice}/></label>
            <label>{text.adminStockField}<input type="number" min="0" step="1" inputMode="numeric" value={draft.stock} onChange={event => change("stock", event.target.value)} required/></label>
            <label className="admin-form-wide">{text.adminDescriptionField}<textarea value={draft.description} maxLength={5000} rows={5} onChange={event => change("description", event.target.value)}/></label>
            <label className="admin-form-wide">{text.adminImageUrl}<textarea value={draft.imageUrls} maxLength={10000} rows={3} onChange={event => { change("imageUrls", event.target.value); setPreviewError(false); }}/></label>
            <label className="admin-form-wide">{text.knownDefects}<textarea value={draft.knownDefects} maxLength={3000} rows={3} onChange={event => change("knownDefects", event.target.value)}/></label>
            <label className="admin-form-wide admin-publish-toggle"><input type="checkbox" checked={draft.isActive} onChange={event => change("isActive", event.target.checked)}/>{text.adminActive}</label>
            <fieldset className="admin-compatibility-fieldset admin-form-wide">
              <legend>{text.adminCompatibilityModels}</legend>
              {vehicleModels.length === 0 ? <p>{text.adminNoCompatibility}</p> : vehicleModels.map(model => {
                const selected = draft.compatibility.find(item => item.modelId === model.id);
                return <div className="admin-compatibility-option" key={model.id}>
                  <label><input type="checkbox" checked={Boolean(selected)} onChange={event => toggleCompatibility(model.id, event.target.checked)}/>
                    {model.make} {model.model}{model.model_year_start ? ` (${model.model_year_start}${model.model_year_end && model.model_year_end !== model.model_year_start ? `–${model.model_year_end}` : ""})` : ""}
                  </label>
                  {selected && <label className="admin-verification-select">{text.fieldCompatibility}<select value={selected.verificationStatus} onChange={event => setCompatibilityVerification(model.id, event.target.value as "verified" | "unverified")}>
                    <option value="unverified">{text.adminCompatibilityUnverified}</option><option value="verified">{text.adminCompatibilityVerified}</option>
                  </select></label>}
                </div>;
              })}
            </fieldset>
            <label className="admin-form-wide admin-file-input">{text.adminChooseImage}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
              const file = event.target.files?.[0] ?? null;
              setFileError("");
              if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
                setSelectedFile(null);
                setFileError(text.invalidFiles);
                event.target.value = "";
                return;
              }
              setSelectedFile(file);
              setPreviewError(false);
            }}/></label>
            <p className="admin-compatibility-note">{text.adminCompatibilityNote}</p>
          </div>
          <aside className="admin-image-preview">
            <h2>{text.adminImagePreview}</h2>
            {preview && !previewError ? <img src={preview} alt={draft.name || text.adminImagePreview} onError={() => setPreviewError(true)}/>
              : <div className="admin-image-preview-empty"><FileImage size={28}/><span>{text.adminNoImage}</span></div>}
            <p>{selectedFile ? text.adminLocalPreview : text.adminImageNotice}</p>
            {fileError && <p className="form-status error" role="alert">{fileError}</p>}
            {selectedFile && <button type="button" className="button button-quiet" onClick={() => setSelectedFile(null)}>{text.remove}</button>}
            {imageUrls.length > 1 && <p>{imageUrls.length} {text.productImages}</p>}
          </aside>
          {formError && <p className="form-status error admin-form-message" role="alert">{formError}</p>}
          <div className="admin-form-actions"><button className="button button-primary" type="submit" disabled={saving}><Check size={16}/>{saving ? text.adminSigningIn : text.adminReviewDraft}</button></div>
        </form>}
  </section>;
}

function AdminProductGallery({ product, text }: CopyProps & { product: Product }) {
  const images = Array.from(new Set([product.image_path, ...(product.image_paths ?? [])]
    .filter((image): image is string => Boolean(image?.trim()))));
  const [selected, setSelected] = useState(images[0] ?? "");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  useEffect(() => {
    setSelected(images[0] ?? "");
    setFailedImages([]);
  }, [product.id, images.join("|")]);

  return <div className="admin-product-gallery">
    <div className="admin-detail-image">
      {selected && !failedImages.includes(selected)
        ? <img src={selected} alt={product.name} onError={() => setFailedImages(current => [...current, selected])}/>
        : <span className="admin-product-placeholder"><PackageSearch size={26}/>{text.noImage}</span>}
    </div>
    {images.length > 1 && <div className="admin-gallery-thumbnails" aria-label={text.productImages}>
      {images.map((image, index) => <button type="button" key={`${image}-${index}`} aria-label={`${text.productImages} ${index + 1}`}
        aria-pressed={selected === image} onClick={() => setSelected(image)}>
        {failedImages.includes(image) ? <FileImage size={17}/> : <img src={image} alt="" loading="lazy" onError={() => setFailedImages(current => [...current, image])}/>}
      </button>)}
    </div>}
  </div>;
}

export default App;
