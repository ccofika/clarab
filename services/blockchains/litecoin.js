const axios = require('axios');

const BLOCKCYPHER_API_URL = 'https://api.blockcypher.com/v1/ltc/main';

/**
 * Get transaction details from Litecoin network
 */
async function getTransaction(txHash) {
  try {
    const response = await axios.get(`${BLOCKCYPHER_API_URL}/txs/${txHash}`);
    const tx = response.data;

    if (!tx) {
      return null;
    }

    // Get primary sender and receiver
    const from = tx.inputs[0]?.addresses?.[0] || 'Unknown';
    const to = tx.outputs[0]?.addresses?.[0] || 'Unknown';

    // Get amount (first output)
    const amount = (tx.outputs[0]?.value || 0) / 1e8; // Convert from satoshis

    // Calculate fee
    const fee = (tx.fees / 1e8).toFixed(8) + ' LTC';

    // Get timestamp
    const timestamp = tx.confirmed ? new Date(tx.confirmed).getTime() / 1000 : Math.floor(Date.now() / 1000);

    return {
      hash: txHash,
      network: 'Litecoin',
      networkType: 'Native',
      coin: 'LTC',
      tokenName: 'Litecoin',
      contractAddress: null,
      from: from,
      to: to,
      amount: amount.toString(),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: tx.confirmations > 0 ? 'success' : 'pending',
      fee: fee,
      blockNumber: tx.block_height,
      confirmations: tx.confirmations
    };

  } catch (error) {
    console.error('Litecoin lookup error:', error.message);
    return null;
  }
}

module.exports = {
  getTransaction
};
