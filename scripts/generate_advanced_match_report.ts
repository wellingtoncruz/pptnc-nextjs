
import * as fs from 'fs';
import * as path from 'path';

// --- Interfaces ---
interface PendingEpisode {
    id: string;
    title: string;
    description: string;
    publishedAt: string;
}

interface SpotifyJsonEpisode {
    title: string;
    description: string;
    spotifyUrl: string;
    release_date: string;
}

interface MatchResult {
    firestoreTitle: string;
    spotifyTitle: string;
    spotifyUrl: string;
    scores: {
        title: number;
        date: number;
        description: number;
        total: number;
    };
    details: {
        dateDiffDays: number;
    };
}

// --- Helper Functions ---

function levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateTitleSimilarity(a: string, b: string): number {
    const normA = normalize(a);
    const normB = normalize(b);
    const maxLength = Math.max(normA.length, normB.length);
    if (maxLength === 0) return 1.0;
    const distance = levenshteinDistance(normA, normB);
    return (maxLength - distance) / maxLength;
}

function calculateDateScore(dateA: string, dateB: string): { score: number, diffDays: number } {
    if (!dateA || !dateB) return { score: 0, diffDays: 999 };

    // Parse dates (assuming ISO format YYYY-MM-DD or ISO string)
    const d1 = new Date(dateA).getTime();
    const d2 = new Date(dateB).getTime();

    if (isNaN(d1) || isNaN(d2)) return { score: 0, diffDays: 999 };

    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Perfect score if within 2 days, decreasing rapidly after 7 days
    if (diffDays <= 2) return { score: 1.0, diffDays };
    if (diffDays <= 7) return { score: 0.8, diffDays };
    if (diffDays <= 14) return { score: 0.5, diffDays };
    if (diffDays <= 30) return { score: 0.2, diffDays };
    return { score: 0.0, diffDays };
}

function calculateDescriptionSimilarity(descA: string, descB: string): number {
    const setA = new Set(tokenize(descA));
    const setB = new Set(tokenize(descB));

    if (setA.size === 0 || setB.size === 0) return 0;

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size; // Jaccard Index
}

function normalize(text: string): string {
    return (text || "").toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

function tokenize(text: string): string[] {
    return normalize(text)
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3); // Filter short words
}

// --- Main Logic ---
async function main() {
    const PENDING_FILE = 'episodes_pending_enrichment.json';
    const SPOTIFY_JSON_FILE = 'spotify_json_data.json';
    const OUTPUT_REPORT = 'advanced_spotify_matches_preview.md';

    try {
        console.log("Loading data...");
        const pendingEpisodes: PendingEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), PENDING_FILE), 'utf-8'));
        const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

        console.log(`Processing 44 pending episodes against ${spotifyData.length} Spotify episodes...`);

        const matches: MatchResult[] = [];

        for (const ep of pendingEpisodes) {
            let bestMatch: SpotifyJsonEpisode | null = null;
            let highestScore = 0;
            let bestScores = { title: 0, date: 0, description: 0, total: 0 };
            let bestDetails = { dateDiffDays: 0 };

            for (const spotifyEp of spotifyData) {
                // 1. Date Score (High Weight)
                // If dates are way off (> 30 days), likely not a match unless title is identical (re-upload?)
                const dateRes = calculateDateScore(ep.publishedAt, spotifyEp.release_date);

                // 2. Title Similarity
                const titleSim = calculateTitleSimilarity(ep.title, spotifyEp.title);

                // 3. Description Similarity
                const descSim = calculateDescriptionSimilarity(ep.description, spotifyEp.description);

                // Weighted Score
                // Date is strong indicator. Title is strong. Description is supporting.
                // If date is perfect (1.0), title can be looser.
                // If date is bad, title must be very strong.

                let totalScore = (titleSim * 0.5) + (dateRes.score * 0.3) + (descSim * 0.2);

                // Boost score if date and title are both good
                if (titleSim > 0.8 && dateRes.score > 0.8) totalScore += 0.1;

                if (totalScore > highestScore) {
                    highestScore = totalScore;
                    bestMatch = spotifyEp;
                    bestScores = { title: titleSim, date: dateRes.score, description: descSim, total: totalScore };
                    bestDetails = { dateDiffDays: dateRes.diffDays };
                }
            }

            if (bestMatch) {
                matches.push({
                    firestoreTitle: ep.title,
                    spotifyTitle: bestMatch.title,
                    spotifyUrl: bestMatch.spotifyUrl,
                    scores: bestScores,
                    details: bestDetails
                });
            }
        }

        // Sort by total score descending
        matches.sort((a, b) => b.scores.total - a.scores.total);

        // Generate Markdown Report
        let report = `# Advanced Spotify Match Preview (Multi-Criteria)\n\n`;
        report += `**Criteria**: Title (50%), Date (30%), Description (20%)\n\n`;
        report += `| Score | Title Sim | Date Diff | Desc Sim | Firestore Title | Spotify Title | URL |\n`;
        report += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

        matches.forEach(m => {
            const scorePct = (m.scores.total * 100).toFixed(1) + '%';
            const titlePct = (m.scores.title * 100).toFixed(0) + '%';
            const descPct = (m.scores.description * 100).toFixed(0) + '%';

            let icon = '❌ ';
            if (m.scores.total > 0.8) icon = '✅ ';
            else if (m.scores.total > 0.6) icon = '⚠️ ';

            // Colorize date diff
            let dateDisplay = `${m.details.dateDiffDays} days`;
            if (m.details.dateDiffDays <= 2) dateDisplay = `🟢 ${dateDisplay}`;
            else if (m.details.dateDiffDays > 30) dateDisplay = `🔴 ${dateDisplay}`;

            report += `| ${icon} **${scorePct}** | ${titlePct} | ${dateDisplay} | ${descPct} | ${m.firestoreTitle.slice(0, 40)}... | ${m.spotifyTitle.slice(0, 40)}... | [Link](${m.spotifyUrl}) |\n`;
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
