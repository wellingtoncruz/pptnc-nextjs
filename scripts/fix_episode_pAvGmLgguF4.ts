
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Guest {
    name: string;
    linkedin?: string;
    role?: string;
    company?: string;
    [key: string]: any;
}

interface EpisodeData {
    title?: string;
    description?: string;
    guests?: Guest[];
    [key: string]: any;
}

const TARGET_ID = "pAvGmLgguF4";

function normalizeString(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toTitleCase(str: string): string {
    if (!str) return "";
    const acronyms = new Set(["CEO", "CTO", "CIO", "COO", "CFO", "CMO", "CPO", "CSO", "CISO", "AI", "BI", "TI", "IT", "UX", "UI", "QA", "SRE", "API", "SDK", "ERP", "CRM", "IOT", "M&A", "CCEE", "PM3", "SXSW", "AWS", "GCP", "LLM", "RAG", "NFT", "DAO", "DEFI", "JSL", "MSD", "CLT", "PJ", "VMBEARS", "VM BEARS", "LGPD", "ESG", "BASF", "GPU"]);
    const minorWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'na', 'no', 'nas', 'nos', 'at']);

    return str.split(' ').map((word, index) => {
        const cleanWord = word.replace(/[^a-zA-Z0-9À-ÿ]/g, "");
        const cleanUpper = cleanWord.toUpperCase();
        if (acronyms.has(cleanUpper)) return word.toUpperCase().replace(cleanWord.toUpperCase(), cleanUpper); // simplified
        const lower = word.toLowerCase();
        if (index > 0 && minorWords.has(lower)) return lower;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

// Custom logic for this episode's format
async function fixEpisode() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    try {
        const docRef = db.collection("videos").doc(TARGET_ID);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            console.error("Doc not found");
            return;
        }

        const data = docSnap.data() as EpisodeData;
        const description = data.description || "";
        const cleanDescription = description.replace(/[\n\r]+/g, ' ');

        let guests: Guest[] = [];

        // Manually extracting based on the user's pointed out Description
        // "Dra. Angélica Caseri, que lidera os esforços de ciência de dados e Inteligência Artificial na BASF"
        // "Prof. José Ahirton Lopes, atuante como Chief Data Officer na Lambda3"
        // "Thiago Rolemberg, responsável pelas áreas de arquitetura, dados e IA na Prudential"

        const manualGuests = [
            {
                name: "Angélica Caseri",
                rawName: "Dra. Angélica Caseri",
                role: "Lidera esforços de ciência de dados e IA",
                company: "BASF",
                linkedin: "https://www.linkedin.com/in/dr-angelica-nardo-caseri-2a19aa4b/"
            },
            {
                name: "José Ahirton Lopes",
                rawName: "Prof. José Ahirton Lopes",
                role: "Chief Data Officer",
                company: "Lambda3",
                linkedin: "https://www.linkedin.com/in/ahirtonlopes/"
            },
            {
                name: "Thiago Rolemberg",
                rawName: "Thiago Rolemberg",
                role: "Responsável pelas áreas de arquitetura, dados e IA",
                company: "Prudential",
                linkedin: "https://www.linkedin.com/in/thiago-rolemberg-msc-71a33a14/"
            }
        ];

        // Refine Role/Company extraction from text if possible, or just use hardcoded base on analysis?
        // Let's deduce role/company dynamically from the text to be robust.

        // Regex for "Name, Role na Company"
        // Matches: "Dra. Angélica Caseri, que lidera ... na BASF"
        const specificData = [
            {
                searchName: "Angélica Caseri",
                linkedin: "https://www.linkedin.com/in/dr-angelica-nardo-caseri-2a19aa4b/"
            },
            {
                searchName: "José Ahirton Lopes",
                linkedin: "https://www.linkedin.com/in/ahirtonlopes/"
            },
            {
                searchName: "Thiago Rolemberg",
                linkedin: "https://www.linkedin.com/in/thiago-rolemberg-msc-71a33a14/"
            }
        ];

        for (const guest of specificData) {
            // Find full phrase: "Name, role na Company"
            // Account for "Dra." or "Prof." prefix optionally
            const regex = new RegExp(`(?:Dra?\\.|Prof\\.|Sr\\.)?\\s*${guest.searchName}[^,]*?,\\s+([^,]+?)\\s+(?:na|no|em|at)\\s+([^,.]+)`, 'i');
            const match = cleanDescription.match(regex);

            let role = "";
            let company = "";

            if (match) {
                role = match[1].trim();
                company = match[2].trim();

                // Clean up "que lidera..." to just "Lidera..."
                if (role.startsWith("que ")) role = role.substring(4);
                // Clean up "atuante como "
                if (role.startsWith("atuante como ")) role = role.substring(13);
            }

            guests.push({
                name: guest.searchName,
                role: toTitleCase(role),
                company: toTitleCase(company),
                linkedin: guest.linkedin
            });

            console.log(`Extracted: ${guest.searchName}`);
            console.log(`   Role: ${toTitleCase(role)}`);
            console.log(`   Company: ${toTitleCase(company)}`);
            console.log(`   LinkedIn: ${guest.linkedin}`);
        }

        // Apply Update
        // await docRef.update({ guests: guests });
        // console.log(`Updated episode ${TARGET_ID} with ${guests.length} guests.`);

        // Force overwrite guests for this episode as requested
        await docRef.update({ guests: guests });
        console.log("Successfully persisted to Firestore.");

    } catch (e) {
        console.error(e);
    }
}

fixEpisode().catch(console.error);
