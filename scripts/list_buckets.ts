
import { Storage } from "@google-cloud/storage";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function listBuckets() {
    const storage = new Storage({ projectId: process.env.GOOGLE_PROJECT_ID });
    const [buckets] = await storage.getBuckets();
    console.log("Buckets:");
    buckets.forEach(bucket => console.log(` - ${bucket.name}`));
}

listBuckets().catch(console.error);
