const {
  MOLTBOOK_SECRET_NAME,
  COMPANY_PRIMARY_SIGNIN_SECRET_NAME,
  LEGACY_MOLTBOOK_SECRET_NAME,
  PRIMARY_NAMESPACE,
  LEGACY_NAMESPACE,
  bootstrapMoltbookAccount,
  updateMoltbookAccount,
  markMoltbookRegistered,
  revealMoltbookAccount,
  readMoltbookAccount,
  getMoltbookAccountSummary,
  migrateLegacyMoltbookSecret
} = require("./moltbookAccountStore");

const bootstrapCompanyPrimarySignin = bootstrapMoltbookAccount;
const updateCompanyPrimarySignin = updateMoltbookAccount;
const markCompanyPrimarySigninRegistered = markMoltbookRegistered;
const revealCompanyPrimarySignin = revealMoltbookAccount;
const readCompanyPrimarySignin = readMoltbookAccount;
const getCompanyPrimarySigninSummary = getMoltbookAccountSummary;
const migrateLegacyCompanyPrimarySigninSecret = migrateLegacyMoltbookSecret;

module.exports = {
  MOLTBOOK_SECRET_NAME,
  COMPANY_PRIMARY_SIGNIN_SECRET_NAME,
  LEGACY_MOLTBOOK_SECRET_NAME,
  PRIMARY_NAMESPACE,
  LEGACY_NAMESPACE,
  bootstrapCompanyPrimarySignin,
  updateCompanyPrimarySignin,
  markCompanyPrimarySigninRegistered,
  revealCompanyPrimarySignin,
  readCompanyPrimarySignin,
  getCompanyPrimarySigninSummary,
  migrateLegacyCompanyPrimarySigninSecret,
  // Legacy exports retained for compatibility.
  bootstrapMoltbookAccount,
  updateMoltbookAccount,
  markMoltbookRegistered,
  revealMoltbookAccount,
  readMoltbookAccount,
  getMoltbookAccountSummary,
  migrateLegacyMoltbookSecret
};
