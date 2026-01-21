import * as fs from 'fs';
import * as path from 'path';

interface SpotifyEpisode {
    name: string;
    description: string;
    release_date: string;
    external_urls: {
        spotify: string;
    };
}

interface SpotifyApiResponse {
    items: SpotifyEpisode[];
}

interface ProcessedEpisode {
    title: string;
    description: string;
    spotifyUrl: string;
    release_date: string;
}

const INPUT_DIR = path.join(process.cwd(), 'scripts');
const OUTPUT_FILE = 'spotify_json_data.json';

async function main() {
    console.log(`Scanning directory: ${INPUT_DIR} for episodies_*.json files...`);

    const files = fs.readdirSync(INPUT_DIR).filter(file => file.startsWith('episodies_') && file.endsWith('.json'));
    console.log(`Found ${files.length} files: ${files.join(', ')}`);

    let allEpisodes: ProcessedEpisode[] = [];

    for (const file of files) {
        const filePath = path.join(INPUT_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const json: SpotifyApiResponse = JSON.parse(content);
            if (json.items && Array.isArray(json.items)) {
                const mapped = json.items.map(item => ({
                    title: item.name,
                    description: item.description, // Added description field
                    spotifyUrl: item.external_urls.spotify,
                    release_date: item.release_date
                }));
                allEpisodes = allEpisodes.concat(mapped);
            }
        } catch (err) {
            console.error(`Error parsing ${file}:`, err);
        }
    }

    console.log(`Total episodes extracted: ${allEpisodes.length}`);

    const outputPath = path.join(process.cwd(), OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(allEpisodes, null, 2));
    console.log(`Saved aggregated data to ${outputPath}`);
}

main().catch(console.error);
