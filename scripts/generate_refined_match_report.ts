
import * as fs from 'fs';
import * as path from 'path';

// --- Interfaces ---
interface PendingEpisode {
    id: string;
    title: string;
    publishedAt: any;
}

interface SpotifyJsonEpisode {
    title: string;
    spotifyUrl: string;
}

interface MatchResult {
    firestoreTitle: string;
    spotifyTitle: string;
    spotifyUrl: string;
    distance: number;
    similarity: number; // 0 to 1
}

// --- Levenshtein Distance Implementation ---
function levenshteinDistance(a: string, b: string): number {
    const matrix = [];

    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function calculateSimilarity(a: string, b: string, distance: number): number {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    return (maxLength - distance) / maxLength;
}

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

// --- Main Logic ---
async function main() {
    const PENDING_FILE = 'episodes_pending_enrichment.json';
    const SPOTIFY_JSON_FILE = 'spotify_json_data.json';
    const OUTPUT_REPORT = 'refined_spotify_matches_preview.md';

    try {
        console.log("Loading data...");
        const pendingEpisodes: PendingEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), PENDING_FILE), 'utf-8'));
        const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

        console.log(`Loaded ${pendingEpisodes.length} pending episodes and ${spotifyData.length} Spotify episodes.`);

        const matches: MatchResult[] = [];

        console.log("Processing matches...");
        for (const ep of pendingEpisodes) {
            const normalizedTarget = normalizeTitle(ep.title);
            let bestMatch: SpotifyJsonEpisode | null = null;
            let minDistance = Infinity;
            let maxSimilarity = 0;

            for (const spotifyEp of spotifyData) {
                const normalizedSource = normalizeTitle(spotifyEp.title);
                const distance = levenshteinDistance(normalizedTarget, normalizedSource);
                const similarity = calculateSimilarity(normalizedTarget, normalizedSource, distance);

                if (distance < minDistance) {
                    minDistance = distance;
                    maxSimilarity = similarity;
                    bestMatch = spotifyEp;
                }
            }

            if (bestMatch) {
                matches.push({
                    firestoreTitle: ep.title,
                    spotifyTitle: bestMatch.title,
                    spotifyUrl: bestMatch.spotifyUrl,
                    distance: minDistance,
                    similarity: maxSimilarity
                });
            }
        }

        // Sort by similarity descending
        matches.sort((a, b) => b.similarity - a.similarity);

        // Generate Markdown Report
        console.log("Generating report...");
        let report = `# Refined Spotify Match Preview Report (Levenshtein Distance)\n\n`;
        report += `**Total Pending Episodes:** ${pendingEpisodes.length}\n\n`;
        report += `> **Note:** High similarity scores (> 0.8) usually indicate a good match. Review carefully.\n\n`;

        report += `| Similarity | Dist | Firestore Title | Best Match (Spotify Title) | Spotify URL |\n`;
        report += `| :--- | :--- | :--- | :--- | :--- |\n`;

        matches.forEach(m => {
            const similarityPercent = (m.similarity * 100).toFixed(1) + '%';
            // Highlight based on threshold
            let icon = '';
            if (m.similarity > 0.8) icon = '✅ ';
            else if (m.similarity > 0.5) icon = '⚠️ ';
            else icon = '❌ ';

            report += `| ${icon}${similarityPercent} | ${m.distance} | ${m.firestoreTitle.slice(0, 60)}... | ${m.spotifyTitle.slice(0, 60)}... | [Link](${m.spotifyUrl}) |\n`;
        });

        const reportPath = path.join(process.cwd(), OUTPUT_REPORT);
        fs.writeFileSync(reportPath, report);
        console.log(`Report generated at: ${reportPath}`);

    } catch (error) {
        console.error("Error generating report:", error);
        process.exit(1);
    }
}

main().catch(console.error);
