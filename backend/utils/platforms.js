// Central definition of supported marketplaces and plan pricing.

const PLATFORMS = {
  FLIPKART: 'flipkart',
  MEESHO: 'meesho',
  AMAZON: 'amazon',
};

const ALL_PLATFORMS = [PLATFORMS.FLIPKART, PLATFORMS.MEESHO, PLATFORMS.AMAZON];

const PLATFORM_LABELS = {
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  amazon: 'Amazon',
};

// Pricing in paise (Razorpay works in paise).
const PRICE_SINGLE = 59900;   // ₹599  — one platform
const PRICE_ALL    = 99900;   // ₹999  — all three platforms

// Is `platform` a valid known platform?
function isValidPlatform(platform) {
  return ALL_PLATFORMS.includes(platform);
}

// Normalize/validate a plans array coming from input.
function sanitizePlans(plans) {
  if (!Array.isArray(plans)) return [];
  const unique = [...new Set(plans.filter((p) => ALL_PLATFORMS.includes(p)))];
  return unique;
}

// Does this user have access to this platform?
function userHasPlatform(user, platform) {
  if (!user) return false;
  if (user.isAdmin) return true; // admins can see everything
  return Array.isArray(user.plans) && user.plans.includes(platform);
}

module.exports = {
  PLATFORMS,
  ALL_PLATFORMS,
  PLATFORM_LABELS,
  PRICE_SINGLE,
  PRICE_ALL,
  isValidPlatform,
  sanitizePlans,
  userHasPlatform,
};
