const axios = require('axios');

// Multiple XRP API endpoints for fallback
const XRP_API_URLS = [
  'https://xrplcluster.com',
  'https://s1.ripple.com:51234',
  'https://s2.ripple.com:51234'
];

/**
 * Get transaction details from XRP Ledger
 */
async function getTransaction(txHash) {
  // Try multiple XRP endpoints
  for (const apiUrl of XRP_API_URLS) {
    try {
      // Get transaction details using rippled API
      const response = await axios.post(apiUrl, {
        method: 'tx',
        params: [{
          transaction: txHash,
          binary: false
        }]
      }, {
        timeout: 5000 // 5 second timeout
      });

      const result = response.data.result;

      if (!result || result.error) {
        continue; // Try next endpoint
      }

      // Process the transaction
      return await processXRPTransaction(result, txHash);

    } catch (error) {
      console.error(`XRP lookup error with ${apiUrl}:`, error.message);
      continue; // Try next endpoint
    }
  }

  // All endpoints failed
  return null;
}

/**
 * Process XRP transaction data
 */
async function processXRPTransaction(tx, txHash) {
  try {
    const meta = tx.meta;

    // Check transaction type
    if (tx.TransactionType !== 'Payment') {
      return null;
    }

    // Get destination tag (important for exchanges)
    const destinationTag = tx.DestinationTag || null;

    // Check for specific XRP errors
    let error = null;
    let errorDetails = null;

    // Check if destination tag is missing but required
    const requiresDestinationTag = await checkIfDestinationTagRequired(tx.Destination);
    if (requiresDestinationTag && !destinationTag) {
      error = 'Missing Destination Tag';
      errorDetails = 'This address requires a destination tag. The transaction may not be credited properly.';
    }

    // Check for account deletion (tecNO_DST_INSUF_XRP)
    if (meta.TransactionResult === 'tecNO_DST_INSUF_XRP') {
      error = 'Account Deletion';
      errorDetails = 'Destination account does not have enough XRP to meet the reserve requirement.';
    }

    // Calculate amount
    let amount = '0';
    let coin = 'XRP';
    let contractAddress = null;

    if (typeof tx.Amount === 'string') {
      // Native XRP payment
      amount = (parseInt(tx.Amount) / 1e6).toString();
      coin = 'XRP';
    } else if (typeof tx.Amount === 'object') {
      // Token payment (IOU)
      amount = tx.Amount.value;
      coin = tx.Amount.currency;
      contractAddress = tx.Amount.issuer;
    }

    // Calculate fee
    const fee = (parseInt(tx.Fee) / 1e6).toFixed(6) + ' XRP';

    // Get status
    const status = meta.TransactionResult === 'tesSUCCESS' ? 'success' : 'failed';

    // Get timestamp (XRP uses Ripple Epoch: seconds since 2000-01-01)
    const rippleEpoch = 946684800; // Unix timestamp for 2000-01-01
    const timestamp = tx.date + rippleEpoch;

    return {
      hash: txHash,
      network: 'XRP Ledger',
      networkType: contractAddress ? 'IOU' : 'Native',
      coin: coin,
      tokenName: coin === 'XRP' ? 'Ripple' : coin,
      contractAddress: contractAddress,
      from: tx.Account,
      to: tx.Destination,
      amount: amount,
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: status,
      fee: fee,
      blockNumber: tx.ledger_index,
      // XRP-specific fields
      destinationTag: destinationTag,
      sourceTag: tx.SourceTag || null,
      error: error,
      errorDetails: errorDetails,
      transactionResult: meta.TransactionResult
    };

  } catch (error) {
    console.error('XRP lookup error:', error.message);
    return null;
  }
}

/**
 * Check if destination address requires a destination tag
 */
async function checkIfDestinationTagRequired(address) {
  // Try to check with first available API
  for (const apiUrl of XRP_API_URLS) {
    try {
      const response = await axios.post(apiUrl, {
        method: 'account_info',
        params: [{
          account: address,
          ledger_index: 'current'
        }]
      }, {
        timeout: 3000
      });

      const accountData = response.data.result?.account_data;

      if (!accountData) {
        return false;
      }

      // Check if requireDestinationTag flag is set
      const flags = accountData.Flags || 0;
      const REQUIRE_DEST_TAG = 0x00020000; // RequireDestTag flag

      return (flags & REQUIRE_DEST_TAG) !== 0;

    } catch (error) {
      // Try next API
      continue;
    }
  }

  // If we can't check with any API, assume it doesn't require tag
  return false;
}

module.exports = {
  getTransaction
};
