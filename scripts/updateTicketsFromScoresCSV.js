const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Ticket = require('../models/Ticket');

async function updateTicketsFromCSV() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Read CSV file
    const csvPath = path.join(__dirname, '../../total_scores.csv');
    console.log(`\nReading CSV file: ${csvPath}`);

    if (!fs.existsSync(csvPath)) {
      console.error(`✗ CSV file not found at: ${csvPath}`);
      process.exit(1);
    }

    const updates = [];
    let rowCount = 0;

    // Read CSV and collect updates
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          rowCount++;

          const gradableId = row['gradable_id'];
          const rubricScore = row['rubric_score'];
          const comment = row['comment'];

          // Validate required fields
          if (!gradableId) {
            return;
          }

          // Parse score - it might be a decimal like 91.47
          let score = null;
          if (rubricScore && rubricScore.trim()) {
            const parsedScore = parseFloat(rubricScore);
            if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
              score = Math.round(parsedScore * 10) / 10; // Round to 1 decimal place
            }
          }

          updates.push({
            ticketId: gradableId.toString().trim(),
            score: score,
            feedback: comment ? comment.trim() : null
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`\n✓ Processed ${rowCount} rows from CSV`);
    console.log(`✓ Prepared ${updates.length} potential updates`);

    // Update tickets in database
    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    let updatedFields = {
      feedback: 0,
      score: 0,
      both: 0
    };

    console.log('\nUpdating tickets in database...');

    for (let i = 0; i < updates.length; i++) {
      try {
        const { ticketId, score, feedback } = updates[i];

        // Find ticket by ticketId
        const ticket = await Ticket.findOne({ ticketId: ticketId });

        if (!ticket) {
          notFoundCount++;
          if (notFoundCount <= 5) {
            console.log(`  ⚠ Ticket ${ticketId} not found in database`);
          }
          continue;
        }

        // Prepare update
        const updateData = {};
        let hasUpdate = false;

        if (feedback && feedback.length > 0) {
          updateData.feedback = feedback;
          hasUpdate = true;
        }

        if (score !== null) {
          updateData.qualityScorePercent = score;
          updateData.status = 'Graded';  // Mark as graded if we have a score
          updateData.gradedDate = new Date();
          hasUpdate = true;
        }

        if (!hasUpdate) {
          continue;
        }

        // Update the ticket
        await Ticket.findByIdAndUpdate(ticket._id, updateData, { new: true });

        successCount++;

        // Track what was updated
        if (feedback && score !== null) {
          updatedFields.both++;
        } else if (feedback) {
          updatedFields.feedback++;
        } else if (score !== null) {
          updatedFields.score++;
        }

        if ((i + 1) % 50 === 0) {
          console.log(`  ✓ Updated ${successCount}/${updates.length} tickets...`);
        }

      } catch (error) {
        console.error(`  ✗ Error updating ticket ${updates[i].ticketId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✓ Successfully updated ${successCount} tickets`);
    console.log(`  - Updated feedback only: ${updatedFields.feedback}`);
    console.log(`  - Updated score only: ${updatedFields.score}`);
    console.log(`  - Updated both: ${updatedFields.both}`);

    if (notFoundCount > 0) {
      console.log(`⚠ ${notFoundCount} tickets not found in database`);
    }
    if (errorCount > 0) {
      console.log(`✗ ${errorCount} tickets failed to update`);
    }

    console.log('\n=== Update Summary ===');
    console.log(`Total rows in CSV: ${rowCount}`);
    console.log(`Tickets found and updated: ${successCount}`);
    console.log(`Tickets not found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  }
}

// Run the update
updateTicketsFromCSV();
