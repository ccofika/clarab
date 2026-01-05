/**
 * INTERCOM SCRAPER TEST v3
 *
 * Automatski:
 * - Klikne na "..." meni
 * - Klikne "Export conversation as text"
 * - Presretne download i sačuva
 * - Izvuče URL-ove slika
 * - Kombinuje sve
 *
 * Korišćenje:
 *   node scripts/intercom-scraper-test.js
 */

const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Output folder
const OUTPUT_DIR = path.join(__dirname, 'intercom-scraper-test');

// Kreiraj output folder ako ne postoji
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper za input iz konzole
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Helper za čuvanje fajlova
function saveFile(filename, content) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (typeof content === 'object') {
    fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
  } else {
    fs.writeFileSync(filepath, content);
  }
  console.log(`   ✅ Saved: ${filename}`);
  return filepath;
}

async function main() {
  console.log('\n========================================');
  console.log('   INTERCOM SCRAPER TEST v3');
  console.log('   (Auto Export)');
  console.log('========================================');
  console.log(`Output folder: ${OUTPUT_DIR}\n`);

  // 1. Pokreni browser SA OMOGUĆENIM DOWNLOADOM
  console.log('[1/7] Pokrećem browser...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true  // VAŽNO: Omogući download
  });

  const page = await context.newPage();

  // 2. Otvori Intercom
  console.log('[2/7] Otvaram Intercom...');
  await page.goto('https://app.intercom.com');

  // 3. Čekaj login
  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log('│  📱 ULOGUJ SE U INTERCOM U BROWSER PROZORU!     │');
  console.log('│                                                 │');
  console.log('│  Kada završiš, vrati se ovde i pritisni ENTER   │');
  console.log('└─────────────────────────────────────────────────┘\n');

  await askQuestion('Pritisni ENTER kada si ulogovan... ');

  // 4. Unesi URL tiketa
  console.log('\n[3/7] Unesi URL tiketa');
  const ticketUrl = await askQuestion('Paste URL: ');

  if (!ticketUrl.includes('intercom.com')) {
    console.log('❌ Neispravan URL!');
    await browser.close();
    return;
  }

  const ticketId = ticketUrl.split('/').pop();
  console.log(`   Ticket ID: ${ticketId}`);

  // 5. Otvori tiket
  console.log('\n[4/7] Otvaram tiket...');
  await page.goto(ticketUrl);
  await page.waitForTimeout(3000);

  // Screenshot
  const screenshotPath = path.join(OUTPUT_DIR, `ticket_${ticketId}_full.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`   ✅ Screenshot saved`);

  // ============================================
  // 6. IZVUCI SLIKE
  // ============================================
  console.log('\n[5/7] Izvlačim slike...');

  const allImages = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    return Array.from(imgs).map(img => ({
      src: img.src,
      alt: img.alt || ''
    }));
  });

  const realImages = allImages.filter(img =>
    img.src.includes('downloads.intercomcdn.com/i/o/')
  );

  console.log(`   Pronađeno: ${realImages.length} slika`);
  realImages.forEach((img, i) => {
    const filename = img.src.split('/').pop().split('?')[0];
    console.log(`   ${i + 1}. ${filename}`);
  });

  // ============================================
  // 7. AUTOMATSKI EXPORT AS TEXT
  // ============================================
  console.log('\n[6/7] Eksportujem konverzaciju...');

  let exportedText = null;

  try {
    // Pokušaj razne selektore za "..." dugme
    const moreButtonSelectors = [
      // Aria labels
      'button[aria-label="More actions"]',
      'button[aria-label="More"]',
      'button[aria-label="More options"]',
      '[aria-label="More actions"]',
      '[aria-label="Actions"]',
      // Data testid
      '[data-testid="conversation-header-more-button"]',
      '[data-testid="more-actions-button"]',
      '[data-testid="inbox-conversation-menu"]',
      // Class based
      '[class*="more-button"]',
      '[class*="MoreButton"]',
      '[class*="actions-menu"]',
      // SVG three dots pattern
      'button:has(svg[class*="ellipsis"])',
      'button:has(svg[class*="dots"])',
      // Header area buttons
      '.conversation-header button:last-child',
      '[class*="ConversationHeader"] button:has(svg)',
      // Generic - poslednji button u header area
      'header button:has(svg)',
    ];

    let moreButton = null;

    for (const selector of moreButtonSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          // Proveri da li je vidljiv
          const isVisible = await btn.isVisible();
          if (isVisible) {
            moreButton = btn;
            console.log(`   Found "More" button with: ${selector}`);
            break;
          }
        }
      } catch (e) {
        // Nastavi sa sledećim selektorom
      }
    }

    if (!moreButton) {
      // Fallback - traži sve buttone i nađi onaj sa tri tačke
      console.log('   Trying fallback: searching all buttons...');

      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const html = await btn.innerHTML();
        // Tri tačke mogu biti "...", "•••", SVG, ili ellipsis
        if (html.includes('ellipsis') || html.includes('dots') || html.includes('•••')) {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            moreButton = btn;
            console.log('   Found button with dots/ellipsis in HTML');
            break;
          }
        }
      }
    }

    if (moreButton) {
      console.log('   Klikćem na "More" dugme...');
      await moreButton.click();
      await page.waitForTimeout(1000);

      // Screenshot menija
      await page.screenshot({ path: path.join(OUTPUT_DIR, `ticket_${ticketId}_menu.png`) });
      console.log('   ✅ Menu screenshot saved');

      // Sada traži "Export" opciju u dropdown meniju
      const exportSelectors = [
        'text="Export conversation as text"',
        'text="Export conversation"',
        'text="Export as text"',
        'text="Export"',
        '[data-testid*="export"]',
        'button:has-text("Export")',
        'div:has-text("Export conversation"):not(:has(div))',
        '[role="menuitem"]:has-text("Export")',
        '[role="option"]:has-text("Export")',
      ];

      let exportButton = null;

      for (const selector of exportSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            const isVisible = await btn.isVisible();
            if (isVisible) {
              exportButton = btn;
              console.log(`   Found "Export" with: ${selector}`);
              break;
            }
          }
        } catch (e) {
          // Nastavi
        }
      }

      if (exportButton) {
        // Postavi listener za download PRE klika
        console.log('   Čekam download...');

        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

        await exportButton.click();

        try {
          const download = await downloadPromise;

          // Sačuvaj fajl
          const exportPath = path.join(OUTPUT_DIR, `ticket_${ticketId}_exported.txt`);
          await download.saveAs(exportPath);

          // Učitaj sadržaj
          exportedText = fs.readFileSync(exportPath, 'utf8');

          console.log(`   ✅ Export uspešan! (${exportedText.length} karaktera)`);
        } catch (downloadError) {
          console.log(`   ⚠️ Download timeout ili greška: ${downloadError.message}`);
        }
      } else {
        console.log('   ⚠️ Nisam pronašao "Export" opciju u meniju');
        console.log('   Snimam sve menuitem-e za debug...');

        // Debug: snimi sve menuitem-e
        const menuItems = await page.$$eval('[role="menuitem"], [role="option"], [class*="menu"] button, [class*="dropdown"] button, [class*="Menu"] div', items =>
          items.map(item => ({
            text: item.innerText?.substring(0, 50),
            className: item.className?.substring(0, 50)
          }))
        );
        saveFile(`ticket_${ticketId}_menu_debug.json`, menuItems);
      }
    } else {
      console.log('   ⚠️ Nisam pronašao "More" dugme');
      console.log('   Debug: snimam sve buttone...');

      // Debug info
      const allButtons = await page.$$eval('button', btns =>
        btns.slice(0, 30).map(btn => ({
          ariaLabel: btn.getAttribute('aria-label'),
          className: btn.className?.substring(0, 50),
          innerText: btn.innerText?.substring(0, 30)
        }))
      );
      saveFile(`ticket_${ticketId}_buttons_debug.json`, allButtons);
    }

  } catch (error) {
    console.log(`   ❌ Greška pri exportu: ${error.message}`);
  }

  // Ako export nije uspeo, pokušaj direktan DOM scrape
  if (!exportedText) {
    console.log('\n   Pokušavam direktan DOM scrape kao fallback...');

    const domText = await page.evaluate(() => {
      // Pokušaj da nađeš glavni conversation area
      const conversationArea = document.querySelector('[class*="conversation"]') ||
                               document.querySelector('main') ||
                               document.querySelector('[class*="Conversation"]');

      if (conversationArea) {
        return conversationArea.innerText;
      }
      return null;
    });

    if (domText && domText.length > 100) {
      exportedText = domText;
      console.log(`   ✅ DOM scrape: ${domText.length} karaktera`);
    }
  }

  // ============================================
  // 8. SAČUVAJ SVE REZULTATE
  // ============================================
  console.log('\n[7/7] Čuvam rezultate...\n');

  const results = {
    ticketId,
    url: ticketUrl,
    scrapedAt: new Date().toISOString(),
    images: realImages.map(img => img.src),
    hasExportedText: !!exportedText,
    exportedTextLength: exportedText?.length || 0,
    exportedTextPreview: exportedText?.substring(0, 500) || null
  };

  saveFile(`ticket_${ticketId}_results.json`, results);

  if (realImages.length > 0) {
    saveFile(`ticket_${ticketId}_images.json`, realImages);
  }

  if (exportedText) {
    saveFile(`ticket_${ticketId}_conversation.txt`, exportedText);

    // Kombinuj tekst sa pravim URL-ovima slika
    console.log('\n--- KOMBINOVANJE TEKSTA I SLIKA ---');

    // Pronađi sve [Image "..."] reference u tekstu
    const imageRefs = exportedText.match(/\[Image "([^"]+)"\]/g) || [];
    console.log(`   Image referenci u tekstu: ${imageRefs.length}`);
    console.log(`   Pravih URL-ova slika: ${realImages.length}`);

    if (imageRefs.length > 0) {
      let combinedText = exportedText;

      imageRefs.forEach((ref, i) => {
        // Izvuci filename iz reference
        const match = ref.match(/\[Image "([^?]+)/);
        if (match) {
          const refFilename = match[1];

          // Nađi odgovarajući pravi URL
          const matchingImage = realImages.find(img =>
            img.src.includes(refFilename.split('?')[0])
          );

          if (matchingImage) {
            // Zameni referencu sa pravim URL-om
            combinedText = combinedText.replace(ref, `[Image: ${matchingImage.src}]`);
            console.log(`   ✅ Matched: ${refFilename.substring(0, 30)}...`);
          } else {
            console.log(`   ⚠️ No match: ${refFilename.substring(0, 30)}...`);
          }
        }
      });

      saveFile(`ticket_${ticketId}_combined.txt`, combinedText);
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n========================================');
  console.log('   REZULTATI');
  console.log('========================================');
  console.log(`Ticket ID: ${ticketId}`);
  console.log(`Slike: ${realImages.length}`);
  console.log(`Tekst: ${exportedText ? 'DA (' + exportedText.length + ' chars)' : 'NE'}`);
  console.log(`\nFajlovi: ${OUTPUT_DIR}`);
  console.log('========================================\n');

  // Čekaj pre zatvaranja
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  TEST ZAVRŠEN!                                  │');
  console.log('│  Pritisni ENTER da zatvoriš browser.            │');
  console.log('└─────────────────────────────────────────────────┘\n');

  await askQuestion('');
  await browser.close();

  console.log('Browser zatvoren.\n');
}

// Pokreni
main().catch(err => {
  console.error('GREŠKA:', err);
  process.exit(1);
});
