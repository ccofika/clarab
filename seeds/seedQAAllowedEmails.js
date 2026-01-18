require('dotenv').config();
const mongoose = require('mongoose');
const QAAllowedEmail = require('../models/QAAllowedEmail');

const allowedEmails = [
  // Original QA users (existing)
  'filipkozomara@mebit.io',
  'vasilijevitorovic@mebit.io',
  'nevena@mebit.io',
  'mladenjorganovic@mebit.io',
  // New QA users (added 2026-01-18)
  'ana@mebit.io',
  'daliborsrejic@mebit.io',
  'danijela@mebit.io',
  'davorborota@mebit.io',
  'ivanadumanovic@mebit.io',
  'jelenaradonjic@mebit.io',
  'jovangajic@mebit.io',
  'lazarmilenkovic@mebit.io',
  'majabasic@mebit.io',
  'marcelavasquez@mebit.io',
  'marijanedeljkovic@mebit.io',
  'markorasic@mebit.io',
  'tamarabortnik@mebit.io',
  'teodorapajovic@mebit.io',
  'valentinasavic@mebit.io',
  'vladimirbabovic@mebit.io',
  'zaklinailic@mebit.io'
];

async function seedQAAllowedEmails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let added = 0;
    let skipped = 0;

    for (const email of allowedEmails) {
      const existing = await QAAllowedEmail.findOne({ email: email.toLowerCase() });
      if (existing) {
        console.log(`  Skipped (already exists): ${email}`);
        skipped++;
      } else {
        await QAAllowedEmail.create({
          email: email.toLowerCase(),
          note: 'Seeded on initial setup'
        });
        console.log(`  Added: ${email}`);
        added++;
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Added: ${added}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total allowed emails: ${await QAAllowedEmail.countDocuments()}`);

    // List all allowed emails
    const allEmails = await QAAllowedEmail.find().sort({ email: 1 });
    console.log('\nAll allowed QA emails:');
    allEmails.forEach(e => console.log(`  - ${e.email}`));

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error seeding QA allowed emails:', error);
    process.exit(1);
  }
}

seedQAAllowedEmails();
