
import axios from 'axios';
import * as cheerio from 'cheerio';

const TEST_URLS = [
    "https://www.linkedin.com/in/adrianomeda", // Example
    "https://www.linkedin.com/in/wellingtoncruz", // Host
    "https://www.linkedin.com/in/paulo-silveira", // Likely Guest
];

async function fetchLinkedInPhoto(url: string) {
    try {
        console.log(`\nFetching: ${url}`);
        // User-Agent is critical to avoid immediate 999/403 often
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 5000
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Try standard OG tag
        let ogImage = $('meta[property="og:image"]').attr('content');

        // Sometimes it's a different tag or requires parsing specific JSON-LD (ignoring complex parsing for now)

        if (ogImage) {
            console.log(`✅ Success: ${ogImage}`);
            return ogImage;
        } else {
            console.log("⚠️  No og:image found. Possible auth wall or different structure.");
            // Check for title to see if we got a valid page or a login screen
            const title = $('title').text().trim();
            console.log(`   Page Title: ${title}`);
        }

    } catch (error: any) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${error.response.statusText}`);
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
    }
}

async function runExperiment() {
    console.log("Starting LinkedIn Photo Extraction Experiment...");

    for (const url of TEST_URLS) {
        await fetchLinkedInPhoto(url);
        // Be polite
        await new Promise(r => setTimeout(r, 2000));
    }
}

runExperiment();
