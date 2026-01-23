
import puppeteer from 'puppeteer';

const TEST_URLS = [
    "https://www.linkedin.com/in/adrianomeda",
    "https://www.linkedin.com/in/paulo-silveira",
    "https://www.linkedin.com/in/guilhermesilveira",
    "https://www.linkedin.com/in/wellingtoncruz"
];

async function runExperiment() {
    console.log("Starting Puppeteer Experiment...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const url of TEST_URLS) {
        try {
            console.log(`\nNavigating to: ${url}`);
            const page = await browser.newPage();

            // Set a realistic User Agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Navigate
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Extract og:image
            const ogImage = await page.evaluate(() => {
                const meta = document.querySelector('meta[property="og:image"]');
                return meta ? meta.getAttribute('content') : null;
            });

            if (ogImage) {
                console.log(`✅ Success: ${ogImage}`);
            } else {
                console.log("⚠️  No og:image found. Reviewing page title...");
                const title = await page.title();
                console.log(`   Title: ${title}`);
            }

            await page.close();
            // polite delay
            await new Promise(r => setTimeout(r, 2000));

        } catch (error: any) {
            console.error(`❌ Error scanning ${url}: ${error.message}`);
        }
    }

    await browser.close();
}

runExperiment();
