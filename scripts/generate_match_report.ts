import * as fs from 'fs';
import * as path from 'path';

interface FirestoreEpisode {
    id: string;
    title: string;
    publishedAt: string;
    spotifyUrl: string | null;
}

interface RssEpisode {
    title: string;
    anchorUrl: string;
    spotifyUrl: string | null;
    pubDate: string;
}

const FIRESTORE_FILE = 'episodes_to_enrich.json';
const RSS_FILE = 'rss_enriched_data.json';
const REPORT_FILE = 'spotify_matches_preview.md';

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

async function main() {
    const firestoreData: FirestoreEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIRESTORE_FILE), 'utf-8'));
    const rssData: RssEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), RSS_FILE), 'utf-8'));

    const rssMap = new Map<string, RssEpisode>();
    rssData.forEach(ep => {
        rssMap.set(normalizeTitle(ep.title), ep);
    });

    let report = '# Spotify Match Preview Report\n\n';
    report += '| Firestore Title | Match Status | Spotify URL Found |\n';
    report += '| :--- | :--- | :--- |\n';

    let matchCount = 0;
    let noMatchCount = 0;
    let spotifyUrlFoundCount = 0;

    for (const fsEp of firestoreData) {
        const normalizedFsTitle = normalizeTitle(fsEp.title);
        const match = rssMap.get(normalizedFsTitle);

        let status = '❌ No Match';
        let urlDisplay = '-';

        if (match) {
            status = '✅ Matched';
            matchCount++;
            if (match.spotifyUrl) {
                urlDisplay = `[Link](${match.spotifyUrl})`;
                spotifyUrlFoundCount++;
            } else {
                urlDisplay = 'No URL in Anchor';
            }
        } else {
            // Simple fuzzy check or checking contains
            const potentialMatch = rssData.find(r => normalizeTitle(r.title).includes(normalizedFsTitle) || normalizedFsTitle.includes(normalizeTitle(r.title)));
            if (potentialMatch) {
                status = '⚠️ Partial Match?';
                urlDisplay = potentialMatch.spotifyUrl ? `[Link](${potentialMatch.spotifyUrl})` : 'No URL';
            } else {
                noMatchCount++;
            }
        }

        report += `| ${fsEp.title.slice(0, 50)}${fsEp.title.length > 50 ? '...' : ''} | ${status} | ${urlDisplay} |\n`;
    }

    report += '\n## Summary\n';
    report += `- Total Firestore Episodes: ${firestoreData.length}\n`;
    report += `- Total Matches: ${matchCount}\n`;
    report += `- Spotify URLs Found: ${spotifyUrlFoundCount}\n`;
    report += `- No Matches: ${noMatchCount}\n`;

    fs.writeFileSync(path.join(process.cwd(), REPORT_FILE), report);
    console.log(`Report generated at ${REPORT_FILE}`);
}

main().catch(console.error);
