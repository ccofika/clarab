const axios = require('axios');

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Known SPL tokens
const SPL_TOKENS = {
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': { symbol: 'TRUMP', name: 'Official Trump', decimals: 6 }
};

/**
 * Get transaction details from Solana network
 */
async function getTransaction(txHash) {
  try {
    // Get transaction with full details
    const response = await axios.post(SOLANA_RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [
        txHash,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0
        }
      ]
    });

    const txData = response.data.result;

    if (!txData) {
      return null;
    }

    const transaction = txData.transaction;
    const meta = txData.meta;

    // Get block time
    const timestamp = txData.blockTime;

    // Check if it's a token transfer or SOL transfer
    const instructions = transaction.message.instructions;

    // Look for SPL token transfer
    for (const instruction of instructions) {
      if (instruction.parsed && instruction.parsed.type === 'transfer') {
        // Check if it's a token transfer
        if (instruction.program === 'spl-token') {
          const info = instruction.parsed.info;
          const mint = info.mint || info.authority;

          let tokenInfo = SPL_TOKENS[mint] || {
            symbol: 'SPL',
            name: 'Solana Token',
            decimals: 9
          };

          const amount = info.amount || info.tokenAmount?.amount || '0';
          const decimals = info.decimals || info.tokenAmount?.decimals || tokenInfo.decimals;
          const formattedAmount = (parseInt(amount) / Math.pow(10, decimals)).toString();

          return {
            hash: txHash,
            network: 'Solana',
            networkType: 'SPL',
            coin: tokenInfo.symbol,
            tokenName: tokenInfo.name,
            contractAddress: mint,
            from: info.source || info.authority,
            to: info.destination,
            amount: formattedAmount,
            timestamp: timestamp,
            dateTime: new Date(timestamp * 1000).toISOString(),
            status: meta.err === null ? 'success' : 'failed',
            fee: (meta.fee / 1e9).toFixed(9) + ' SOL',
            blockNumber: txData.slot
          };
        }

        // Native SOL transfer
        if (instruction.program === 'system') {
          const info = instruction.parsed.info;
          const lamports = info.lamports;
          const amount = (lamports / 1e9).toString();

          return {
            hash: txHash,
            network: 'Solana',
            networkType: 'Native',
            coin: 'SOL',
            tokenName: 'Solana',
            contractAddress: null,
            from: info.source,
            to: info.destination,
            amount: amount,
            timestamp: timestamp,
            dateTime: new Date(timestamp * 1000).toISOString(),
            status: meta.err === null ? 'success' : 'failed',
            fee: (meta.fee / 1e9).toFixed(9) + ' SOL',
            blockNumber: txData.slot
          };
        }
      }
    }

    // Fallback: basic transaction info
    const preBalances = meta.preBalances;
    const postBalances = meta.postBalances;
    const accountKeys = transaction.message.accountKeys;

    // Find sender and receiver by balance changes
    let from = accountKeys[0]?.pubkey || 'Unknown';
    let to = 'Unknown';
    let amount = 0;

    for (let i = 0; i < preBalances.length; i++) {
      const diff = postBalances[i] - preBalances[i];
      if (diff < 0 && accountKeys[i]) {
        from = accountKeys[i].pubkey;
        amount = Math.abs(diff);
      } else if (diff > 0 && accountKeys[i]) {
        to = accountKeys[i].pubkey;
      }
    }

    return {
      hash: txHash,
      network: 'Solana',
      networkType: 'Native',
      coin: 'SOL',
      tokenName: 'Solana',
      contractAddress: null,
      from: from,
      to: to,
      amount: (amount / 1e9).toString(),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: meta.err === null ? 'success' : 'failed',
      fee: (meta.fee / 1e9).toFixed(9) + ' SOL',
      blockNumber: txData.slot
    };

  } catch (error) {
    console.error('Solana lookup error:', error.message);
    return null;
  }
}

module.exports = {
  getTransaction
};
