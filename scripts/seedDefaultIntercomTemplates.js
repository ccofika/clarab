/**
 * Seed default Intercom report templates.
 * Run once: node scripts/seedDefaultIntercomTemplates.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const IntercomReportTemplate = require('../models/IntercomReportTemplate');

// Use direct connection to bypass SRV resolution issues on some networks
const MONGO_URI = process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI;

const DEFAULT_TEMPLATES = [
  {
    name: 'English Drill',
    isDefault: true,
    createdBy: null,
    filters: {
      adminAssigneeIds: [{ id: '7967445', name: 'GordanR' }],
      adminAssigneeOperator: 'is',
      topics: [
        'Monthly bonus',
        'Bonus (English)',
        'KYC | Fraud',
        'promotion, benefits, weekly bonus, bonus, Rakeback, affiliate bonus, wager bonus, bonus drop, forum promotion, challenge',
        'Available bonus',
      ],
      topicOperator: 'is_not',
      tagIds: [{ id: '8117858', name: 'verification' }],
      tagOperator: 'is_not',
      kycCountries: ['IN', 'NG'],
      kycCountryOperator: 'is_not',
      teamAssigneeIds: [
        { id: '8238352', name: 'India - Account reactivation' },
        { id: '8389289', name: 'India - Crypto' },
        { id: '8212652', name: 'India - Deposits' },
        { id: '8212682', name: 'India - Miscellaneous' },
        { id: '8212669', name: 'India - Verification' },
        { id: '8212659', name: 'India - Unclaimed bonuses' },
        { id: '8212658', name: 'India - Withdrawals' },
        { id: '8238218', name: 'India graveyard' },
        { id: '7256796', name: 'Indian Team Plat 1-3' },
        { id: '7292039', name: 'Sports Team India' },
        { id: '4436183', name: 'Sports team' },
      ],
      teamAssigneeOperator: 'is_not',
      state: '',
    },
  },
  {
    name: 'Arabic Drill',
    isDefault: true,
    createdBy: null,
    filters: {
      adminAssigneeIds: [{ id: '8825116', name: 'MilicaMil' }],
      adminAssigneeOperator: 'is',
      topics: ['Available bonus', 'Arabic | Bonuses', 'Arabic | KYC'],
      topicOperator: 'is_not',
      tagIds: [{ id: '8117858', name: 'verification' }],
      tagOperator: 'is_not',
      teamAssigneeIds: [],
      teamAssigneeOperator: 'is',
      kycCountries: [],
      kycCountryOperator: 'is',
      state: '',
    },
  },
  {
    name: 'Turkish Drill',
    isDefault: true,
    createdBy: null,
    filters: {
      adminAssigneeIds: [{ id: '8419453', name: 'Kerem' }],
      adminAssigneeOperator: 'is',
      topics: ['Turkish | Bonuses', 'Turkish | TRY FIAT', 'Turkish | KYC'],
      topicOperator: 'is_not',
      tagIds: [{ id: '8117858', name: 'verification' }],
      tagOperator: 'is_not',
      teamAssigneeIds: [],
      teamAssigneeOperator: 'is',
      kycCountries: [],
      kycCountryOperator: 'is',
      state: '',
    },
  },
  {
    name: 'French Drill',
    isDefault: true,
    createdBy: null,
    filters: {
      adminAssigneeIds: [{ id: '8143148', name: 'Noman' }],
      adminAssigneeOperator: 'is',
      topics: ['French | Bonuses', 'French | KYC'],
      topicOperator: 'is_not',
      tagIds: [{ id: '8117858', name: 'verification' }],
      tagOperator: 'is_not',
      teamAssigneeIds: [{ id: '4436183', name: 'Sports team' }],
      teamAssigneeOperator: 'is_not',
      kycCountries: [],
      kycCountryOperator: 'is',
      state: '',
    },
  },
  {
    name: 'Notes Seniors Drill',
    isDefault: true,
    createdBy: null,
    filters: {
      adminAssigneeIds: [{ id: '8042277', name: 'Nebojsa' }],
      adminAssigneeOperator: 'is',
      topics: [],
      topicOperator: 'is',
      tagIds: [],
      tagOperator: 'is',
      teamAssigneeIds: [],
      teamAssigneeOperator: 'is',
      kycCountries: [],
      kycCountryOperator: 'is',
      state: '',
    },
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Remove existing defaults
  const { deletedCount } = await IntercomReportTemplate.deleteMany({ isDefault: true });
  console.log(`Removed ${deletedCount} existing default templates`);

  // Insert new defaults
  const created = await IntercomReportTemplate.insertMany(DEFAULT_TEMPLATES);
  console.log(`Created ${created.length} default templates:`);
  created.forEach(t => console.log(`  - ${t.name} (${t._id})`));

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch(e => {
  console.error(e);
  process.exit(1);
});
