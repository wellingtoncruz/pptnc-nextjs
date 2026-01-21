import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

const RSS_URL = 'https://anchor.fm/s/6f2a8478/podcast/rss';
const OUTPUT_FILE = 'rss_enriched_data.json';

interface EnrichedEpisode {
    title: string;
    anchorUrl: string;
    spotifyUrl: string | null;
    pubDate: string;
}

async function resolveSpotifyUrl(anchorUrl: string): Promise<string | null> {
    try {
        const response = await fetch(anchorUrl);
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // Look for anchor tags defined by "Ouça no Spotify" or checking href structure
        // Anchors usually have a specific list of platform links.
        // We search for a link that goes to open.spotify.com
        const anchors = Array.from(doc.querySelectorAll('a'));
        const spotifyLink = anchors.find(a =>
            (a.href && a.href.includes('open.spotify.com/episode')) ||
            (a.textContent && a.textContent.toLowerCase().includes('spotify'))
        );

        if (spotifyLink && spotifyLink.href.includes('open.spotify.com')) {
            return spotifyLink.href;
        }

        return null;
    } catch (error) {
        console.error(`Error resolving URL for ${anchorUrl}:`, error);
        return null;
    }
}

async function main() {
    const parser = new Parser();
    console.log(`Fetching RSS feed from ${RSS_URL}...`);

    try {
        const feed = await parser.parseURL(RSS_URL);
        console.log(`Found ${feed.items.length} items in RSS feed.`);

        const enrichedEpisodes: EnrichedEpisode[] = [];

        // Limits concurrent requests to avoid being blocked, though for ~200 items we should be careful.
        // Processing in batches of 10
        const BATCH_SIZE = 10;
        const items = feed.items;

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${i + 1} to ${Math.min(i + BATCH_SIZE, items.length)}...`);

            const promises = batch.map(async (item) => {
                const title = item.title || 'Untitled';
                const anchorUrl = item.link;
                let spotifyUrl: string | null = null;

                if (anchorUrl) {
                    spotifyUrl = await resolveSpotifyUrl(anchorUrl);
                }

                return {
                    title,
                    anchorUrl: anchorUrl || '',
                    spotifyUrl,
                    pubDate: item.pubDate || ''
                };
            });

            const results = await Promise.all(promises);
            enrichedEpisodes.push(...results);

            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const outputPath = path.join(process.cwd(), OUTPUT_FILE);
        fs.writeFileSync(outputPath, JSON.stringify(enrichedEpisodes, null, 2));
        console.log(`Saved enriched data to ${outputPath}`);
        console.log(`Total episodes processed: ${enrichedEpisodes.length}`);
        console.log(`Total Spotify URLs found: ${enrichedEpisodes.filter(e => e.spotifyUrl).length}`);

    } catch (error) {
        console.error("Error processing RSS feed:", error);
        process.exit(1);
    }
}

main().catch(console.error);
