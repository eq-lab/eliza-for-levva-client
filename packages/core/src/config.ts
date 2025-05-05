import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localEnvPath = path.join(__dirname, "../../../.env.local");
const defaultEnvPath = path.join(__dirname, "../../../.env");

if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
}

if (fs.existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath, override: false });
}
