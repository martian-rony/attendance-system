// One-off migration: copy local DB test data into the cloud (Atlas) DB.
// NON-DESTRUCTIVE: docs are inserted only if their _id is NOT already present
// in the cloud (updateOne with $setOnInsert + upsert). Existing cloud docs are
// never overwritten or duplicated. Original _ids are preserved, so attendance
// <-> session <-> student <-> enrollment links stay intact.
//
// Usage:
//   CLOUD_URI="mongodb+srv://..." node backend/src/scripts/seed-local-to-cloud.js [--apply]
// Without --apply it runs as a DRY RUN (no writes to cloud).
//
// Cloud URI is read from CLOUD_URI env only. Never hardcode it.
//
// Some ISP resolvers (e.g. Reliance/Jio) refuse to resolve Atlas SRV hostnames
// even though the account allowlist is fine. Force a public resolver so the
// driver can find the cluster. This only affects this script's DNS lookups.
try {
  require('dns').setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {
  /* setServers unavailable (e.g. non-privileged) — ignore, allowlist still applies */
}
const { MongoClient } = require('mongodb');

const LOCAL_URI = process.env.LOCAL_URI || 'mongodb://localhost:27017/attendance-system';
const CLOUD_URI = process.env.CLOUD_URI;
const DB_NAME = 'attendance-system';
const COLLECTIONS = ['users', 'courses', 'enrollments', 'sessions', 'attendances'];
const APPLY = process.argv.includes('--apply');

if (!CLOUD_URI) {
  console.error('CLOUD_URI env not set. Usage: CLOUD_URI=... node seed-local-to-cloud.js [--apply]');
  process.exit(1);
}

(async () => {
  const local = new MongoClient(LOCAL_URI);
  const cloud = new MongoClient(CLOUD_URI);
  await local.connect();
  await cloud.connect();
  const ldb = local.db(DB_NAME);
  const cdb = cloud.db(DB_NAME);

  let totalInsert = 0;
  let totalSkip = 0;

  for (const col of COLLECTIONS) {
    const lcol = ldb.collection(col);
    const ccol = cdb.collection(col);
    const docs = await lcol.find({}).toArray();
    let insert = 0;
    let skip = 0;
    let err = 0;
    for (const doc of docs) {
      try {
        if (!APPLY) {
          // True dry run: only check whether the _id already exists in cloud.
          const exists = await ccol.countDocuments({ _id: doc._id }, { limit: 1 });
          if (exists > 0) skip++;
          else insert++;
          continue;
        }
        const r = await ccol.updateOne(
          { _id: doc._id },
          { $setOnInsert: doc },
          { upsert: true }
        );
        if (r.upsertedCount > 0) insert++;
        else skip++;
      } catch (e) {
        err++;
        if (err <= 3) console.error(`  ! ${col} _id=${String(doc._id)}: ${e.message}`);
      }
    }
    totalInsert += insert;
    totalSkip += skip;
    console.log(
      `${col.padEnd(13)} local=${String(docs.length).padStart(3)}  insert=${String(insert).padStart(3)}  skip=${String(skip).padStart(3)}  err=${err}`
    );
  }

  console.log(
    `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — total insert=${totalInsert} skip=${totalSkip}`
  );
  await local.close();
  await cloud.close();
  if (APPLY && totalInsert > 0) console.log('Cloud DB now seeded with local test data.');
})().catch((e) => {
  console.error('MIGRATION FAILED:', e.message);
  process.exit(1);
});
