const express = require('express');
const router = express.Router();
const transactionLookup = require('../services/transactionLookup');

/**
 * POST /api/transaction/lookup
 * Lookup transaction details across all supported blockchains
 */
router.post('/lookup', async (req, res) => {
  try {
    const { hash, network } = req.body;

    if (!hash || !hash.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash is required'
      });
    }

    // Lookup transaction
    const transactionData = await transactionLookup.lookupTransaction(hash.trim(), network);

    if (!transactionData) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found on any supported network',
        hash: hash.trim()
      });
    }

    // Format the response
    res.json({
      success: true,
      data: transactionData
    });

  } catch (error) {
    console.error('Transaction lookup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error looking up transaction',
      error: error.message
    });
  }
});

module.exports = router;
