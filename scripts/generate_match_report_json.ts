import * as fs from 'fs';
import * as path from 'path';

interface FirestoreEpisode {
    id: string;
    title: string;
    publishedAt: string;
    spotifyUrl: string | null;
}

interface SpotifyJsonEpisode {
    title: string;
    spotifyUrl: string;
    release_date: string;
}

const FIRESTORE_FILE = 'episodes_to_enrich.json';
const SPOTIFY_JSON_FILE = 'spotify_json_data.json';
const REPORT_FILE = 'spotify_matches_preview.md';

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

async function main() {
    const firestoreData: FirestoreEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIRESTORE_FILE), 'utf-8'));
    const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

    const spotifyMap = new Map<string, SpotifyJsonEpisode>();
    spotifyData.forEach(ep => {
        spotifyMap.set(normalizeTitle(ep.title), ep);
    });

    let report = '# Spotify Match Preview Report (Source: JSON Files)\n\n';
    report += '| Firestore Title | Match Status | Spotify URL Found |\n';
    report += '| :--- | :--- | :--- |\n';

    let matchCount = 0;
    let noMatchCount = 0;
    let spotifyUrlFoundCount = 0;

    for (const fsEp of firestoreData) {
        const normalizedFsTitle = normalizeTitle(fsEp.title);

        // Exact normalized match
        let match = spotifyMap.get(normalizedFsTitle);

        // Reverse check if not found (sometimes JSON title has more info or less)
        if (!match) {
            match = spotifyData.find(s => normalizeTitle(s.title) === normalizedFsTitle);
        }

        let status = '❌ No Match';
        let urlDisplay = '-';

        if (match) {
            status = '✅ Matched';
            matchCount++;
            urlDisplay = `[Link](${match.spotifyUrl})`;
            spotifyUrlFoundCount++;
        } else {
            // Fuzzy contains check
            const potentialMatch = spotifyData.find(s => {
                const normS = normalizeTitle(s.title);
                return normS.includes(normalizedFsTitle) || normalizedFsTitle.includes(normS);
            });

            if (potentialMatch) {
                status = '⚠️ Partial Match?';
                urlDisplay = `[Link](${potentialMatch.spotifyUrl})`;
                // We count partials as potential finds too for the user to verify
            } else {
                noMatchCount++;
            }
        }

        report += `| ${fsEp.title.slice(0, 50)}${fsEp.title.length > 50 ? '...' : ''} | ${status} | ${urlDisplay} |\n`;
    }

    report += '\n## Summary\n';
    report += `- Total Firestore Episodes: ${firestoreData.length}\n`;
    report += `- Total Exact Matches: ${matchCount}\n`;
    report += `- Total Matches (Exact + Partial): ${matchCount + (firestoreData.length - matchCount - noMatchCount)}\n`;
    report += `- No Matches: ${noMatchCount}\n`;

    fs.writeFileSync(path.join(process.cwd(), REPORT_FILE), report);
    console.log(`Report generated at ${REPORT_FILE}`);
}

main().catch(console.error);
