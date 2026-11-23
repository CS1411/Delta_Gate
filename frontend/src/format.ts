import type { SavedBy } from './types'

// The UI only formats engine numbers. null means unknown: never show it as 0.
const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** ₹2,86,000 (Indian grouping). */
export const inr = (n: number) => `${n < 0 ? '−' : ''}₹${INR.format(Math.abs(n))}`

/** +₹4,000 / −₹7,500 / ₹0. */
export const signedInr = (n: number) => (n > 0 ? '+' : '') + inr(n)

/** Honest banner wording (build rule 4): name the app that saved the values, never claim Excel otherwise. */
export const savedByBanner = (savedBy: SavedBy | string) =>
  savedBy === 'Microsoft Excel' ? "Verified against Excel's saved values"
    : savedBy === 'LibreOffice' ? "Verified against LibreOffice's saved values"
      : 'Not verifiable against saved values'
