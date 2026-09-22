// Import this FIRST (before any module that reads process.env at import
// time, like lib/db.js) in files that aren't run through Next's own env
// loading — i.e. server.js and the scripts/ folder.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
