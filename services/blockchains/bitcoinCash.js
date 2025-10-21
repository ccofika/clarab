const axios = require('axios');

const BLOCKCHAIR_API_URL = 'https://api.blockchair.com/bitcoin-cash';

/**
 * Get transaction details from Bitcoin Cash network
 */
async function getTransaction(txHash) {
  try {
    const response = await axios.get(`${BLOCKCHAIR_API_URL}/dashboards/transaction/${txHash}`);
    const data = response.data.data;

    if (!data || !data[txHash]) {
      return null;
    }

    const tx = data[txHash].transaction;
    const inputs = data[txHash].inputs;
    const outputs = data[txHash].outputs;

    // Get primary sender and receiver
    const from = inputs[0]?.recipient || 'Unknown';
    const to = outputs[0]?.recipient || 'Unknown';

    // Get amount (first output)
    const amount = (outputs[0]?.value || 0) / 1e8; // Convert from satoshis

    // Calculate fee
    const fee = (tx.fee / 1e8).toFixed(8) + ' BCH';

    // Get timestamp
    const timestamp = new Date(tx.time).getTime() / 1000;

    return {
      hash: txHash,
      network: 'Bitcoin Cash',
      networkType: 'Native',
      coin: 'BCH',
      tokenName: 'Bitcoin Cash',
      contractAddress: null,
      from: from,
      to: to,
      amount: amount.toString(),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: tx.block_id > 0 ? 'success' : 'pending',
      fee: fee,
      blockNumber: tx.block_id,
      confirmations: 'Confirmed'
    };

  } catch (error) {
    console.error('Bitcoin Cash lookup error:', error.message);
    return null;
  }
}

module.exports = {
  getTransaction
};
