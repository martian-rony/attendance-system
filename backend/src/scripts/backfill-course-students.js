// One-time, NON-DESTRUCTIVE backfill: sync Course.students from Enrollment.
// Only $addToSet is used (idempotent — never removes existing members).
// Safe to run repeatedly. Reads MONGODB_URI from the environment.
import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { connectDB } from '../config/database.js';

const main = async () => {
  await connectDB();
  const enrollments = await Enrollment.find({ status: 'active' }).select('student course');
  const byCourse = {};
  for (const e of enrollments) {
    (byCourse[e.course.toString()] ||= []).push(e.student);
  }
  let total = 0;
  for (const [courseId, studentIds] of Object.entries(byCourse)) {
    await Course.findByIdAndUpdate(courseId, {
      $addToSet: { students: { $each: studentIds } },
    });
    total += studentIds.length;
  }
  console.log(`Backfilled Course.students for ${Object.keys(byCourse).length} courses (${total} memberships).`);
  await mongoose.connection.close();
  process.exit(0);
};

main().catch(async (e) => {
  console.error(e);
  await mongoose.connection.close();
  process.exit(1);
});
