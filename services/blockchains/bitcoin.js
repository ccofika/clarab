const axios = require('axios');

const BLOCKSTREAM_API_URL = 'https://blockstream.info/api';

/**
 * Get transaction details from Bitcoin network
 */
async function getTransaction(txHash) {
  try {
    // Get transaction details
    const response = await axios.get(`${BLOCKSTREAM_API_URL}/tx/${txHash}`);
    const tx = response.data;

    if (!tx) {
      return null;
    }

    // Calculate total input and output
    const totalInput = tx.vin.reduce((sum, input) => sum + (input.prevout?.value || 0), 0);
    const totalOutput = tx.vout.reduce((sum, output) => sum + output.value, 0);
    const fee = totalInput - totalOutput;

    // Get primary sender and receiver
    const from = tx.vin[0]?.prevout?.scriptpubkey_address || 'Unknown';
    const to = tx.vout[0]?.scriptpubkey_address || 'Unknown';

    // Get amount sent (first output is usually the main transfer)
    const amount = (tx.vout[0]?.value || 0) / 1e8; // Convert satoshis to BTC

    // Get block time
    let timestamp = tx.status.block_time || Math.floor(Date.now() / 1000);

    return {
      hash: txHash,
      network: 'Bitcoin',
      networkType: 'Native',
      coin: 'BTC',
      tokenName: 'Bitcoin',
      contractAddress: null,
      from: from,
      to: to,
      amount: amount.toString(),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: tx.status.confirmed ? 'success' : 'pending',
      fee: (fee / 1e8).toFixed(8) + ' BTC',
      blockNumber: tx.status.block_height,
      confirmations: tx.status.confirmed ? 'Confirmed' : 'Pending'
    };

  } catch (error) {
    console.error('Bitcoin lookup error:', error.message);
    return null;
  }
}

module.exports = {
  getTransaction
};
