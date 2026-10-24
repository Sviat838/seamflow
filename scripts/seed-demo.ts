// Demo data for the live feed and the /companies leaderboard: `npm run seed:demo`.
//
// Creates 10 imagined hot dog businesses (one email + password account each, one company each),
// draws 20 unique product photos per company (scripts/seed-demo/render.ts) and runs every one
// through the REAL classifier (classifyImage), so verdicts and HDX Ratings are genuine. Scans are
// persisted like createScan does (same mappers, storage helpers, audit events and certificates),
// dated over the last few hours so the feed looks alive. Server-side, so the per-visitor quota and
// rate limits don't apply.
//
// Idempotent: accounts, companies and scans (keyed by company + file name) that already exist are
// skipped, so a re-run only fills gaps and a finished seed makes no classifier calls.
//
//   npm run seed:demo                           seed everything missing
//   npm run seed:demo -- --preview <dir>        write a contact sheet of the planned images, no API calls
//   npm run seed:demo -- --dry-run              print what would be done
//   npm run seed:demo -- --only <slug> --count 2   pilot: first 2 images of one company
//
// Needs .env.local: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SEED_DEMO_PASSWORD.
import { createHash, randomUUID } from "node:crypto";
import { classifyImage } from "@/lib/ai";
import { assertValidImage } from "@/lib/ai/image";
import { recordAuditEvents } from "@/lib/audit/record";
import { issueCertificate } from "@/lib/certificates/service";
import { serverEnv } from "@/lib/env";
import { toScanDetails, toVerdictFields, truncate } from "@/lib/scans/mappers";
import { intakeAuditEvents } from "@/lib/scans/audit";
import { scanImagePath, uploadScanImage } from "@/lib/scans/storage";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { emailFor, IMAGES_PER_COMPANY, SEED_COMPANIES, type SeedCompany } from "./seed-demo/companies";
import { planCompanyShots, type PlannedShot } from "./seed-demo/plan";
import { renderShot } from "./seed-demo/render";

type ScanInsert = Database["public"]["Tables"]["scans"]["Insert"];

const REQUEST_ID = "seed-demo";
const MAX_ERROR_RATE = 0.1;
/** Don't judge the error rate on fewer attempts than this. */
const MIN_ATTEMPTS_FOR_ERROR_RATE = 10;

interface Options {
  preview: string | null;
  dryRun: boolean;
  only: string | null;
  count: number;
  maxCalls: number;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { preview: null, dryRun: false, only: null, count: IMAGES_PER_COMPANY, maxCalls: 200, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--preview") opts.preview = value();
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--only") opts.only = value();
    else if (arg === "--count") opts.count = Number(value());
    else if (arg === "--max-calls") opts.maxCalls = Number(value());
    else if (arg === "--concurrency") opts.concurrency = Number(value());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const n of [opts.count, opts.maxCalls, opts.concurrency]) {
    if (!Number.isInteger(n) || n < 1) throw new Error("--count, --max-calls and --concurrency must be positive integers");
  }
  return opts;
}

const say = (message: string) => console.log(`[seed] ${message}`);

// ---------------------------------------------------------------------------
// Accounts and companies
// ---------------------------------------------------------------------------

async function ensureAccount(admin: AdminClient, company: SeedCompany, password: string): Promise<string> {
  const email = emailFor(company);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: company.contact.name },
  });
  if (data.user) return data.user.id;
  if (error?.code !== "email_exists") throw new Error(`createUser ${email}: ${error?.message}`);

  // Already there (a previous run): find it and keep its password in step with .env.local.
  for (let page = 1; page <= 20; page++) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw new Error(`listUsers: ${listError.message}`);
    const found = list.users.find((u) => u.email === email);
    if (found) {
      const { error: updateError } = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      if (updateError) throw new Error(`updateUser ${email}: ${updateError.message}`);
      return found.id;
    }
    if (list.users.length < 200) break;
  }
  throw new Error(`${email} exists but could not be found`);
}

async function ensureCompany(admin: AdminClient, company: SeedCompany, userId: string): Promise<string> {
  const existing = await admin.from("companies").select("id, created_by").eq("slug", company.slug).maybeSingle();
  if (existing.error) throw new Error(`companies lookup: ${existing.error.message}`);
  let companyId = existing.data?.id;
  if (existing.data && existing.data.created_by !== userId) {
    throw new Error(`Company slug "${company.slug}" is taken by another account; refusing to touch it`);
  }
  if (!companyId) {
    const inserted = await admin
      .from("companies")
      .insert({ name: company.name, slug: company.slug, created_by: userId })
      .select("id")
      .single();
    if (inserted.error) throw new Error(`create company ${company.name}: ${inserted.error.message}`);
    companyId = inserted.data.id;
  }
  const linked = await admin
    .from("profiles")
    .update({ company_id: companyId, company_role: "owner", job_title: company.contact.title, display_name: company.contact.name })
    .eq("id", userId)
    .select("id");
  if (linked.error) throw new Error(`link profile: ${linked.error.message}`);
  if (linked.data.length === 0) throw new Error(`No profile for ${emailFor(company)} (auth trigger missing?)`);
  return companyId;
}

// ---------------------------------------------------------------------------
// One scan: render -> classify -> persist (like createScan) -> audit -> certificate
// ---------------------------------------------------------------------------

interface Job {
  company: SeedCompany;
  companyId: string;
  userId: string;
  shot: PlannedShot;
}

interface Stats {
  attempted: number;
  errors: number;
  saved: number;
  hotDogs: number;
}

async function runJob(admin: AdminClient, job: Job, startedAt: number): Promise<{ verdict: string; confidence: number; rating: number | null }> {
  const { company, companyId, userId, shot } = job;
  const bytes = await renderShot(shot.spec);
  const mimeType = assertValidImage(bytes);
  const { classification, model, latencyMs } = await classifyImage({ bytes, mimeType });

  const scanId = randomUUID();
  const imagePath = scanImagePath(userId, scanId, mimeType);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const uploaded = await uploadScanImage(admin, imagePath, bytes, mimeType, REQUEST_ID);
  const verdict = toVerdictFields(classification.verdict, classification);
  const createdAt = new Date(startedAt - shot.minutesAgo * 60_000).toISOString();

  const row: ScanInsert = {
    id: scanId,
    user_id: userId,
    visitor_id: null,
    company_id: companyId,
    verdict: classification.verdict,
    confidence: classification.confidence,
    summary: truncate(classification.summary, 500),
    details: toScanDetails(classification, false),
    policy_clause: verdict.policyClause,
    rating: verdict.rating,
    rating_note: verdict.ratingNote,
    region: company.region,
    file_name: shot.fileName,
    image_path: uploaded ? imagePath : null,
    image_mime: mimeType,
    image_bytes: bytes.byteLength,
    image_sha256: sha256,
    model,
    latency_ms: latencyMs,
    is_public: false,
    ip_hash: null,
    request_id: REQUEST_ID,
    created_at: createdAt,
  };
  const inserted = await admin.from("scans").insert(row).select("id").single();
  if (inserted.error) throw new Error(`insert scan ${shot.fileName}: ${inserted.error.message}`);

  await recordAuditEvents(scanId, intakeAuditEvents({
    submitter: company.contact.name,
    fileName: shot.fileName,
    mimeType,
    imageBytes: bytes.byteLength,
    sha256,
    imageStored: uploaded,
    verdict: classification.verdict,
    confidence: classification.confidence,
    policyClause: verdict.policyClause,
    model,
    cached: false,
  }));
  const certificate = await issueCertificate({ scanId, issuedTo: company.name });
  // The certificate is issued "now"; date it with its scan so the record reads consistently.
  if (certificate) await admin.from("certificates").update({ created_at: createdAt }).eq("scan_id", scanId);

  return { verdict: classification.verdict, confidence: classification.confidence, rating: verdict.rating };
}

/** Runs jobs with limited concurrency; stops taking new ones when the budget or error rate is blown. */
async function runAll(admin: AdminClient, jobs: Job[], opts: Options): Promise<{ stats: Stats; stopped: string | null }> {
  const stats: Stats = { attempted: 0, errors: 0, saved: 0, hotDogs: 0 };
  const startedAt = Date.now();
  let next = 0;
  let stopped: string | null = null;
  const total = Math.min(jobs.length, opts.maxCalls);

  async function worker() {
    while (!stopped) {
      if (stats.attempted >= opts.maxCalls) {
        stopped = `classifier call budget of ${opts.maxCalls} reached`;
        return;
      }
      const job = jobs[next++];
      if (!job) return;
      stats.attempted++;
      const label = `${job.shot.fileName}`;
      const began = Date.now();
      try {
        const result = await runJob(admin, job, startedAt);
        stats.saved++;
        if (result.verdict === "hot_dog") stats.hotDogs++;
        const verdict = result.verdict === "hot_dog" ? "HOT DOG    " : "NOT HOT DOG";
        say(`${String(stats.saved + stats.errors).padStart(3)}/${total}  ${label.padEnd(46)} ${verdict} ${(result.confidence * 100).toFixed(1).padStart(5)}%  rating ${String(result.rating ?? "-").padStart(3)}  ${((Date.now() - began) / 1000).toFixed(1)}s`);
      } catch (error) {
        stats.errors++;
        say(`${String(stats.saved + stats.errors).padStart(3)}/${total}  ${label.padEnd(46)} ERROR ${error instanceof Error ? error.message : String(error)}`);
        if (stats.attempted >= MIN_ATTEMPTS_FOR_ERROR_RATE && stats.errors / stats.attempted > MAX_ERROR_RATE) {
          stopped = `error rate ${stats.errors}/${stats.attempted} is above ${MAX_ERROR_RATE * 100}%`;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  return { stats, stopped };
}

/** Round-robin across companies, so a stopped run still leaves every company with some scans. */
function interleave(perCompany: Job[][]): Job[] {
  const out: Job[] = [];
  for (let i = 0; perCompany.some((jobs) => i < jobs.length); i++) {
    for (const jobs of perCompany) if (i < jobs.length) out.push(jobs[i]);
  }
  return out;
}

async function printLeaderboard(admin: AdminClient): Promise<void> {
  const { data, error } = await admin.rpc("get_company_leaderboard", { p_limit: 50 });
  if (error) return say(`leaderboard RPC failed: ${error.message}`);
  say("Leaderboard (smoothed HDX Rating):");
  for (const [i, row] of data.entries()) {
    say(`  ${String(i + 1).padStart(2)}. ${String(row.score).padStart(5)}  ${row.name.padEnd(36)} ${row.rated_hot_dogs} rated / ${row.total_scans} scans`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.preview) {
    const { writePreview } = await import("./seed-demo/preview");
    return writePreview(opts.preview);
  }

  process.loadEnvFile(".env.local");
  const env = serverEnv();
  const password = process.env.SEED_DEMO_PASSWORD;
  const admin = getAdminClient();
  if (!admin) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)");
  if (!opts.dryRun && !env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing");
  if (!password || password.length < 8) throw new Error("Set SEED_DEMO_PASSWORD (8+ characters) in .env.local");

  const companies = SEED_COMPANIES.filter((c) => !opts.only || c.slug === opts.only);
  if (companies.length === 0) throw new Error(`Unknown company slug: ${opts.only}`);

  const perCompany: Job[][] = [];
  for (const company of companies) {
    const planned = planCompanyShots(company).slice(0, Math.min(opts.count, IMAGES_PER_COMPANY));
    let userId = "dry-run";
    let companyId = "dry-run";
    let done = new Set<string>();
    if (!opts.dryRun) {
      userId = await ensureAccount(admin, company, password);
      companyId = await ensureCompany(admin, company, userId);
      const existing = await admin.from("scans").select("file_name").eq("company_id", companyId);
      if (existing.error) throw new Error(`scans lookup: ${existing.error.message}`);
      done = new Set(existing.data.map((r) => r.file_name ?? ""));
    }
    const missing = planned.filter((shot) => !done.has(shot.fileName));
    say(`${company.name} (${emailFor(company)}, ${company.region}): ${planned.length - missing.length}/${planned.length} scans exist, ${missing.length} to do`);
    perCompany.push(missing.map((shot) => ({ company, companyId, userId, shot })));
  }

  const jobs = interleave(perCompany);
  if (jobs.length === 0) {
    say("Nothing to do: the demo data is already seeded.");
    return printLeaderboard(admin);
  }
  if (opts.dryRun) {
    say(`Dry run: ${jobs.length} classifier calls would be made (budget ${opts.maxCalls}).`);
    return;
  }
  if (jobs.length > opts.maxCalls) say(`Budget: only the first ${opts.maxCalls} of ${jobs.length} images will be classified.`);

  say(`Classifying ${Math.min(jobs.length, opts.maxCalls)} images, ${opts.concurrency} at a time`);
  const { stats, stopped } = await runAll(admin, jobs, opts);
  say(`Done: ${stats.saved} saved (${stats.hotDogs} hot dogs), ${stats.errors} errors, ${stats.attempted} classifier calls.`);
  await printLeaderboard(admin);
  if (stopped) {
    say(`STOPPED: ${stopped}. Re-running continues where this left off.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[seed] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
