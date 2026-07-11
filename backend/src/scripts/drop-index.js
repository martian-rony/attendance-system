// One-off: drop the stale courses.location_2dsphere index that was removed
// from the Course schema. Courses don't need geolocation (sessions do).
import mongoose from 'mongoose';
import { config } from 'dotenv';

config();
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance-system';

const conn = await mongoose.connect(uri);
try {
  await conn.connection.collection('courses').dropIndex('location_2dsphere');
  console.log('dropped courses.location_2dsphere index');
} catch (e) {
  console.log('no stale courses index (ok):', e.code || e.message);
}
await mongoose.disconnect();
process.exit(0);
