const axios = require('axios');

// Using public EOS nodes
const EOS_API_URLS = [
  'https://eos.greymass.com',
  'https://api.eosn.io',
  'https://eos.api.eosnation.io'
];

/**
 * Get transaction details from EOS network
 */
async function getTransaction(txHash) {
  // Try multiple EOS endpoints
  for (const apiUrl of EOS_API_URLS) {
    try {
      const response = await axios.post(`${apiUrl}/v1/history/get_transaction`, {
        id: txHash
      });

      const tx = response.data;

      if (!tx || !tx.trx) {
        continue;
      }

      const transaction = tx.trx.trx;
      const actions = transaction.actions;

      // Look for transfer action
      const transferAction = actions.find(action => action.name === 'transfer');

      if (!transferAction) {
        // Return basic transaction info if no transfer found
        return {
          hash: txHash,
          network: 'EOS',
          networkType: 'Native',
          coin: 'EOS',
          tokenName: 'EOS',
          contractAddress: null,
          from: actions[0]?.authorization?.[0]?.actor || 'Unknown',
          to: 'Unknown',
          amount: '0',
          timestamp: new Date(transaction.expiration).getTime() / 1000,
          dateTime: transaction.expiration,
          status: tx.trx.receipt.status === 'executed' ? 'success' : 'failed',
          fee: '0 EOS',
          blockNumber: tx.block_num,
          memo: null,
          error: null
        };
      }

      const data = transferAction.data;
      const memo = data.memo || null;

      // Check for missing memo error
      let error = null;
      let errorDetails = null;

      // If memo is empty but destination might require it (common for exchanges)
      if (!memo || memo.trim() === '') {
        // Check if 'to' account looks like an exchange (simplified check)
        const exchangeAccounts = ['binancecleos', 'huobideposit', 'okbtothemoon', 'krakenkraken'];
        if (exchangeAccounts.includes(data.to)) {
          error = 'Missing Memo';
          errorDetails = 'This destination account may require a memo. The transaction may not be credited properly.';
        }
      }

      // Parse amount
      const amountStr = data.quantity || '0 EOS';
      const amount = amountStr.split(' ')[0];
      const coin = amountStr.split(' ')[1] || 'EOS';

      // Get timestamp
      const timestamp = new Date(tx.block_time).getTime() / 1000;

      return {
        hash: txHash,
        network: 'EOS',
        networkType: coin === 'EOS' ? 'Native' : 'Token',
        coin: coin,
        tokenName: coin,
        contractAddress: transferAction.account !== 'eosio.token' ? transferAction.account : null,
        from: data.from,
        to: data.to,
        amount: amount,
        timestamp: timestamp,
        dateTime: new Date(timestamp * 1000).toISOString(),
        status: tx.trx.receipt.status === 'executed' ? 'success' : 'failed',
        fee: '0 EOS', // EOS doesn't have transaction fees in the traditional sense
        blockNumber: tx.block_num,
        // EOS-specific fields
        memo: memo,
        error: error,
        errorDetails: errorDetails
      };

    } catch (error) {
      console.error(`EOS lookup error with ${apiUrl}:`, error.message);
      // Try next endpoint
      continue;
    }
  }

  // If all endpoints failed
  return null;
}

module.exports = {
  getTransaction
};
