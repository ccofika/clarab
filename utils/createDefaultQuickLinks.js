const QuickLink = require('../models/QuickLink');

const defaultQuickLinks = [
  {
    categoryName: 'Stake',
    links: [
      { name: 'Verification', url: 'https://stake.com/settings/verification', type: 'copy' },
      { name: 'Security', url: 'https://stake.com/settings/security', type: 'copy' },
      { name: 'Preferences', url: 'https://stake.com/settings/preferences', type: 'copy' },
      { name: 'Deposits Crypto', url: 'https://stake.com/transactions/deposits', type: 'copy' },
      { name: 'Withdrawals Crypto', url: 'https://stake.com/transactions/withdrawals', type: 'copy' },
      { name: 'Deposits Fiat', url: 'https://stake.com/transactions/deposits/banking', type: 'copy' },
      { name: 'Withdrawals Fiat', url: 'https://stake.com/transactions/withdrawals/banking', type: 'copy' },
      { name: 'Transaction History', url: 'https://stake.com/transactions/other', type: 'copy' },
      { name: 'Gambling limits', url: 'https://stake.com/responsible-gambling/gambling-limits', type: 'copy' },
      { name: 'Deposit limits', url: 'https://stake.com/responsible-gambling/deposit-limits', type: 'copy' }
    ]
  },
  {
    categoryName: 'Stake Bonuses',
    links: [
      { name: 'All Bonuses', url: 'https://stake.com/transactions/bonuses', type: 'copy' },
      { name: 'Reload', url: 'https://stake.com/transactions/bonuses/reload', type: 'copy' },
      { name: 'Race Payout', url: 'https://stake.com/transactions/bonuses/race-payout', type: 'copy' },
      { name: 'Raffle', url: 'https://stake.com/transactions/raffles', type: 'copy' },
      { name: 'Welcome offer', url: 'https://stake.com/settings/offers', type: 'copy' }
    ]
  },
  {
    categoryName: 'Transactions',
    links: [
      { name: 'PIQ', url: 'https://auth.iqservices.io/auth/realms/iq/protocol/openid-connect/auth?response_type=code&client_id=piq&scope=openid%20offline_access%20profile%20email%20address%20phone%20roles%20paymentiq&state=0YL1DapEohnLzVwWY9-Ma8Nc0z3YtuPCS8EAQLMQC04%3D&redirect_uri=https://backoffice.paymentiq.io/paymentiq/login/oauth2/code/piq&nonce=8-E1Qo-5QmEbUDjS60k5kLZWsy20wp-HOdBpJiYtK9c', type: 'open' },
      { name: 'Payper', url: 'https://dashboard.payper.ca/login/', type: 'open' },
      { name: 'Moonpay order id', url: 'https://buy.moonpay.com/v2/transaction-tracker?transactionId=', type: 'open' },
      { name: 'PSP Status excel', url: 'https://docs.google.com/spreadsheets/d/1JymnOgnxCAiT7Ov5oVWcrCVSESl0ZLcU/edit?gid=1467572627#gid=1467572627', type: 'open' },
      { name: 'OKlink', url: 'https://www.oklink.com/', type: 'open' }
    ]
  },
  {
    categoryName: 'Word Documents',
    links: [
      { name: 'Some crypto tips', url: 'https://docs.google.com/document/d/1sIKwm59fdAewDjYN9KpMtvno8uD8YDarbCMNG00OcwQ/edit?tab=t.0#heading=h.ltze2it9hmm5', type: 'open' },
      { name: 'CAD Gigadat transaction flow', url: 'https://docs.google.com/document/d/19iih5HRz7LxBicBc84iebDdetwuZxeGphns6SBsBciM/edit?tab=t.0', type: 'open' },
      { name: 'COUNTRIES, RESTRICTIONS AND THEIR PROCESS', url: 'https://docs.google.com/document/d/17Pe9TK-L6vEThqi3RRSJbyAvUfpRnnBxMRYecaDT8cU/edit?tab=t.0#heading=h.gn7u9ceyk1qv', type: 'open' },
      { name: 'Possible tickets and solution', url: 'https://docs.google.com/document/d/1611QBmhiVY0yKCWIfmCpFsgj52qAC83i7MUtu_DdxSk/edit?tab=t.0', type: 'open' }
    ]
  }
];

/**
 * Creates default quick links for a new user
 * @param {String} userId - The user's ID
 * @returns {Promise<void>}
 */
async function createDefaultQuickLinks(userId) {
  try {
    // Get existing categories for this user
    const existingCategories = await QuickLink.find({ userId }).select('categoryName');
    const existingCategoryNames = existingCategories.map(cat => cat.categoryName);

    // Filter out categories that already exist
    const categoriesToCreate = defaultQuickLinks.filter(
      category => !existingCategoryNames.includes(category.categoryName)
    );

    if (categoriesToCreate.length === 0) {
      console.log(`⏭️  User ${userId} already has all default categories`);
      return;
    }

    const quickLinksToCreate = categoriesToCreate.map(category => ({
      userId,
      categoryName: category.categoryName,
      links: category.links
    }));

    await QuickLink.insertMany(quickLinksToCreate);
    console.log(`✅ Default quick links created for user ${userId} (${categoriesToCreate.length} categories)`);
  } catch (error) {
    console.error(`❌ Error creating default quick links for user ${userId}:`, error);
    // Don't throw error to prevent registration failure
  }
}

module.exports = { createDefaultQuickLinks };
