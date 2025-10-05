const express = require('express');
const router = express.Router();
const axios = require('axios');

// Get transaction details from OKLink
router.post('/lookup', async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash) {
      return res.status(400).json({ message: 'Transaction hash is required' });
    }

    // OKLink API endpoint
    const apiUrl = 'https://www.oklink.com/api/v5/explorer/transaction/transaction-fills';

    // Try to get transaction from OKLink
    // Note: We'll try multiple chains since we don't know which one initially
    const chains = ['ETH', 'BSC', 'POLYGON', 'ARBITRUM', 'OPBNB', 'OPTIMISM', 'AVAXC', 'BASE'];

    let transactionData = null;
    let foundChain = null;

    for (const chain of chains) {
      try {
        const response = await axios.get(apiUrl, {
          params: {
            chainShortName: chain,
            txid: hash
          },
          headers: {
            'Ok-Access-Key': process.env.OKLINK_API_KEY || ''
          }
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          transactionData = response.data.data[0];
          foundChain = chain;
          break;
        }
      } catch (error) {
        // Continue to next chain if this one fails
        continue;
      }
    }

    if (!transactionData) {
      return res.status(404).json({
        message: 'Transaction not found on any supported network',
        hash: hash
      });
    }

    // Format the response
    const formattedData = {
      hash: transactionData.txid || hash,
      network: foundChain,
      from: transactionData.from || 'N/A',
      to: transactionData.to || 'N/A',
      token: transactionData.transactionSymbol || 'N/A',
      amount: transactionData.amount || '0',
      time: transactionData.transactionTime || 'N/A',
      transactionFee: transactionData.txfee || '0',
      status: transactionData.state || 'N/A',
      blockHeight: transactionData.blockHeight || 'N/A'
    };

    res.json({ success: true, data: formattedData });

  } catch (error) {
    console.error('Transaction lookup error:', error);
    res.status(500).json({
      message: 'Error looking up transaction',
      error: error.message
    });
  }
});

module.exports = router;
