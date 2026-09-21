// Single source of truth for the price. Read server-side only when
// creating Cashfree orders — never trust an amount sent from the client.
export const PRODUCT_PRICE_INR = 199;
export const PRODUCT_PRICE_PAISE = PRODUCT_PRICE_INR * 100;
export const CURRENCY = "INR";
