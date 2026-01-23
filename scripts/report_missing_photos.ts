
import { Firestore } from "@google-cloud/firestore";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const OUTPUT_FILE = path.join(process.cwd(), "missing_photos_report.md");

async function generateReport() {
    console.log("Initializing Firestore...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    console.log("Fetching full episodes...");
    const snapshot = await db.collection('videos')
        .where('isFullEpisode', '==', true)
        .get();

    let reportContent = "# Relatório de Fotos Faltantes\n\n";
    reportContent += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
    reportContent += "Lista de guests que possuem Link do LinkedIn mas o campo `photo` continua vazio.\n\n";

    let missingCount = 0;
    let totalEpisodesChecked = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const guests = data.guests || [];
        const missingGuests = [];

        for (const guest of guests) {
            // Check if guest has LinkedIn but NO photo
            if (guest.linkedin && guest.linkedin.includes('linkedin.com')) {
                if (!guest.photo || guest.photo.trim() === "") {
                    missingGuests.push(guest);
                }
            }
        }

        if (missingGuests.length > 0) {
            reportContent += `## ${data.title} (${doc.id})\n`;
            missingGuests.forEach(g => {
                reportContent += `- **Nome**: ${g.name}\n`;
                reportContent += `  - **LinkedIn**: [${g.linkedin}](${g.linkedin})\n`;
                reportContent += `  - **Status**: Foto não encontrada\n`;
            });
            reportContent += "\n---\n\n";
            missingCount += missingGuests.length;
        }
        totalEpisodesChecked++;
    }

    reportContent += `\n**Total de Guests Pendentes:** ${missingCount}\n`;
    reportContent += `**Total de Episódios Verificados:** ${snapshot.size}\n`;

    fs.writeFileSync(OUTPUT_FILE, reportContent);
    console.log(`✅ Relatório gerado com sucesso: ${OUTPUT_FILE}`);
    console.log(`Guests Pendentes: ${missingCount}`);
}

generateReport().catch(console.error);
