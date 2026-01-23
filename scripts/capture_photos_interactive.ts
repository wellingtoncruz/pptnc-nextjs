
import puppeteer, { Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const PROJECT_ROOT = "/home/wellington/Documentos/PPTNC/pptnc";
const GUEST_LIST_FILE = path.join(PROJECT_ROOT, "guests_for_photos.json");
const RELATIVE_DOWNLOAD_PATH = "public/guests";
const DOWNLOAD_DIR = path.join(PROJECT_ROOT, RELATIVE_DOWNLOAD_PATH);

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// === Helpers ===

async function downloadImage(url: string, filepath: string) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                res.pipe(fs.createWriteStream(filepath))
                    .on('error', reject)
                    .once('close', () => resolve(filepath));
            } else {
                res.resume();
                reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
            }
        });
    });
}

// Check if guest already has a photo in DB
async function guestAlreadyHasPhoto(db: Firestore, episodeId: string, linkedinUrl: string): Promise<boolean> {
    const doc = await db.collection('videos').doc(episodeId).get();
    if (!doc.exists) return false;
    const data = doc.data();
    if (!data || !data.guests) return false;

    const guest = data.guests.find((g: any) => g.linkedin === linkedinUrl);
    return !!(guest && guest.photo);
}

async function updateGuestInFirestore(db: Firestore, episodeId: string, guestLinkedIn: string, photoFilename: string) {
    const docRef = db.collection('videos').doc(episodeId);
    await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) return;
        const data = doc.data();
        if (!data || !data.guests) return;

        const guests = data.guests;
        let modified = false;

        const newGuests = guests.map((g: any) => {
            if (g.linkedin === guestLinkedIn) {
                modified = true;
                return { ...g, photo: photoFilename };
            }
            return g;
        });

        if (modified) {
            t.update(docRef, { guests: newGuests });
            console.log(`💾 Firestore updated for episode ${episodeId}`);
        }
    });
}

function getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function performNavigationException(page: Page) {
    const targets = [
        { labels: ['Início', 'Home'], name: "Home" },
        { labels: ['Minha rede', 'My Network'], name: "My Network" },
        { labels: ['Notificações', 'Notifications'], name: "Notifications" }
    ];

    const target = targets[Math.floor(Math.random() * targets.length)];

    console.log(`\n🛑 TRIGGERED HUMAN BEHAVIOR EXCEPTION`);
    console.log(`➡️  Clicking Nav Item: ${target.name}`);

    try {
        const foundAndClicked = await page.evaluate((labels) => {
            const navItems = Array.from(document.querySelectorAll('.global-nav__primary-items li a'));

            // 1. Try text content
            for (const item of navItems) {
                const text = item.textContent?.trim() || "";
                if (labels.some(l => text.includes(l))) {
                    (item as HTMLElement).click();
                    return true;
                }
            }

            // 2. Try aria-labels
            for (const item of navItems) {
                const aria = item.getAttribute('aria-label') || "";
                if (labels.some(l => aria.includes(l))) {
                    (item as HTMLElement).click();
                    return true;
                }
            }
            return false;
        }, target.labels);

        if (!foundAndClicked) {
            console.log(`⚠️  Nav element for '${target.name}' not found. Skipping click.`);
        }

    } catch (e: any) {
        console.log(`⚠️  Error clicking nav item: ${e.message}`);
    }

    console.log("⏳ Waiting 3s for load...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("📜 Scrolling to bottom...");
    await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });

    console.log("☕ Taking a break (10s)...");
    await new Promise(r => setTimeout(r, 10000));
    console.log("✅ Resuming capture...\n");
}

// === Main ===

async function runInteractiveCapture() {
    console.log("Starting Interactive Capture (Advanced Human-Like Mode)...");

    if (!fs.existsSync(GUEST_LIST_FILE)) {
        console.error(`❌ Error: File not found at ${GUEST_LIST_FILE}`);
        process.exit(1);
    }

    const db = new Firestore({ projectId: process.env.GOOGLE_PROJECT_ID, databaseId: "pptnc" });
    const guests = JSON.parse(fs.readFileSync(GUEST_LIST_FILE, 'utf-8'));
    console.log(`Loaded ${guests.length} guests to process.`);

    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
        console.log("✅ Connected to Chrome!");
    } catch (e) {
        console.error("❌ Could not connect. Run: google-chrome --remote-debugging-port=9222 --user-data-dir=\"/tmp/chrome-debug\"");
        process.exit(1);
    }

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    console.log("Wait 2s...");
    await new Promise(r => setTimeout(r, 2000));

    // Logic State
    let globalProcessedCount = 0; // Total processed (never resets)
    let shortCycleCount = 0;      // Counter for nav exception (resets)
    let nextShortBreak = getRandomInt(1, 4); // Target for nav exception

    console.log(`🎯 Next short break after ${nextShortBreak} profiles.`);

    for (const guest of guests) {

        // 0. Validity Check
        if (!guest.linkedin || !guest.linkedin.includes('linkedin.com')) {
            console.log(`⏩ Skipping ${guest.name} (No valid LinkedIn URL).`);
            continue;
        }

        // 1. Skip check (already has photo)
        const hasPhoto = await guestAlreadyHasPhoto(db, guest.episodeId, guest.linkedin);
        if (hasPhoto) {
            console.log(`⏩ Skipping ${guest.name} (Photo already exists).`);
            continue;
        }

        // --- ANTI-DETECTION CHECKS (Execute before processing) ---

        // Check A: Long Pause (Every 10 processed)
        // Independent of short break
        if (globalProcessedCount > 0 && globalProcessedCount % 10 === 0) {
            console.log(`\n🛑 LONG PAUSE TRIGGERED (Global Count: ${globalProcessedCount})`);
            console.log(`☕ Taking a 5-minute break...`);
            await new Promise(r => setTimeout(r, 5 * 60 * 1000));
            console.log(`✅ Resuming...\n`);
        }

        // Check B: Short Break (Random Navigation)
        if (shortCycleCount >= nextShortBreak) {
            await performNavigationException(page);
            shortCycleCount = 0; // Reset short cycle
            nextShortBreak = getRandomInt(1, 4);
            console.log(`🎯 Next short break after ${nextShortBreak} profiles.`);
        }

        // --- PROCESSING ---
        console.log(`\nProcessing: ${guest.name} (#${globalProcessedCount + 1})`);

        try {
            await page.goto(guest.linkedin, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log("Waiting 5s for page render...");
            await new Promise(r => setTimeout(r, 5000));

            const photoUrl = await page.evaluate(() => {
                const img = document.querySelector('img.pv-top-card-profile-picture__image--show') ||
                    document.querySelector('.profile-photo-edit__preview') ||
                    document.querySelector('img.pv-top-card-profile-picture__image');
                return img ? img.getAttribute('src') : null;
            });

            if (photoUrl) {
                console.log(`✅ Found Photo URL`);
                const cleanName = guest.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const filename = `${cleanName}.jpg`;
                const filepath = path.join(DOWNLOAD_DIR, filename);
                await downloadImage(photoUrl, filepath);
                console.log(`📸 Saved to: ${filepath}`);
                await updateGuestInFirestore(db, guest.episodeId, guest.linkedin, filename);
            } else {
                console.log("⚠️  Photo not found on page.");
            }

            // Increment Counters only on attempt (even if photo not found, we visited)
            globalProcessedCount++;
            shortCycleCount++;

        } catch (error: any) {
            console.error(`❌ Error processing ${guest.name}: ${error.message}`);
        }

        // Default pause between profiles
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }

    console.log("\nCapture complete. Disconnecting...");
    await browser.disconnect();
}

runInteractiveCapture();
