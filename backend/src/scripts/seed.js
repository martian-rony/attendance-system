import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Session from '../models/Session.js';
import Enrollment from '../models/Enrollment.js';
import { connectDB } from '../config/database.js';
import { logger } from '../utils/logger.js';

const SALT_ROUNDS = 12;

const seedUsers = async () => {
  let users = [
    {
      email: 'admin@college.edu',
      passwordHash: await bcrypt.hash('Admin@1234', SALT_ROUNDS),
      firstName: 'System',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      department: 'Administration',
    },
    {
      email: 'faculty1@college.edu',
      passwordHash: await bcrypt.hash('Faculty@123', SALT_ROUNDS),
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'faculty',
      isActive: true,
      employeeId: 'FAC001',
      department: 'Computer Science',
      designation: 'Assistant Professor',
    },
    {
      email: 'faculty2@college.edu',
      passwordHash: await bcrypt.hash('Faculty@123', SALT_ROUNDS),
      firstName: 'John',
      lastName: 'Doe',
      role: 'faculty',
      isActive: true,
      employeeId: 'FAC002',
      department: 'Mathematics',
      designation: 'Professor',
    },
  ];

  // Generate students
  for (let i = 1; i <= 30; i++) {
    users.push({
      email: `student${i}@college.edu`,
      passwordHash: await bcrypt.hash('Student@123', SALT_ROUNDS),
      firstName: `Student`,
      lastName: `${i}`,
      role: 'student',
      isActive: true,
      studentId: `STU${String(i).padStart(3, '0')}`,
      program: 'B.Tech Computer Science',
      year: Math.ceil(i / 10),
      semester: i % 8 || 1,
      rollNumber: `CSE${String(i).padStart(3, '0')}`,
    });
  }

  users = await User.insertMany(users);
  logger.info(`Seeded ${users.length} users`);
  return users;
};

const seedCourses = async (faculty, students) => {
  const csFaculty = faculty.find(
    (f) => f.role === 'faculty' && f.department === 'Computer Science'
  );
  const mathFaculty = faculty.find((f) => f.role === 'faculty' && f.department === 'Mathematics');

  const courses = [
    {
      code: 'CS101',
      name: 'Introduction to Programming',
      description: 'Fundamentals of programming using Python',
      credits: 4,
      department: 'Computer Science',
      semester: 1,
      academicYear: '2024-2025',
      faculty: csFaculty._id,
      schedule: [
        { day: 'monday', startTime: '09:00', endTime: '10:30', room: 'LAB-A' },
        { day: 'wednesday', startTime: '09:00', endTime: '10:30', room: 'LAB-A' },
      ],
      location: { type: 'Point', coordinates: [SEED_GEOFENCE.lon, SEED_GEOFENCE.lat] },
      geofenceRadius: SEED_GEOFENCE.radius,
      settings: { requireGeolocation: true },
    },
    {
      code: 'CS201',
      name: 'Data Structures and Algorithms',
      description: 'Advanced data structures and algorithms',
      credits: 4,
      department: 'Computer Science',
      semester: 3,
      academicYear: '2024-2025',
      faculty: csFaculty._id,
      schedule: [
        { day: 'tuesday', startTime: '11:00', endTime: '12:30', room: 'LAB-B' },
        { day: 'thursday', startTime: '11:00', endTime: '12:30', room: 'LAB-B' },
      ],
      location: { type: 'Point', coordinates: [SEED_GEOFENCE.lon, SEED_GEOFENCE.lat] },
      geofenceRadius: SEED_GEOFENCE.radius,
      settings: { requireGeolocation: true },
    },
    {
      code: 'MATH101',
      name: 'Calculus I',
      description: 'Differential and integral calculus',
      credits: 3,
      department: 'Mathematics',
      semester: 1,
      academicYear: '2024-2025',
      faculty: mathFaculty._id,
      schedule: [{ day: 'monday', startTime: '14:00', endTime: '15:30', room: 'ROOM-101' }],
      location: { type: 'Point', coordinates: [SEED_GEOFENCE.lon, SEED_GEOFENCE.lat] },
      geofenceRadius: SEED_GEOFENCE.radius,
      settings: { requireGeolocation: true },
    },
  ];

  const created = await Course.insertMany(courses);
  logger.info(`Seeded ${created.length} courses`);

  // Enroll students
  const enrollments = [];
  for (const course of created) {
    const studentSlice = students.filter((s) => s.role === 'student').slice(0, 20);
    for (const student of studentSlice) {
      enrollments.push({
        student: student._id,
        course: course._id,
        enrolledBy: course.faculty,
        status: 'active',
      });
    }
  }

  await Enrollment.insertMany(enrollments);
  logger.info(`Seeded ${enrollments.length} enrollments`);
  return created;
};

const seedSessions = async (courses) => {
  const sessions = [];
  const today = new Date();

  for (const course of courses) {
    for (let i = 0; i < 5; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i * 7); // Weekly sessions

      const session = {
        course: course._id,
        faculty: course.faculty,
        title: `Lecture ${i + 1}`,
        description: `Regular lecture for ${course.code}`,
        date,
        startTime: '09:00',
        endTime: '10:30',
        room: 'LAB-A',
        status: i === 0 ? 'scheduled' : 'completed',
        location: course.location,
        geofenceRadius: course.geofenceRadius,
      };
      sessions.push(session);
    }
  }

  await Session.insertMany(sessions);
  logger.info(`Seeded ${sessions.length} sessions`);
};

// Geofence location/radius for seeded demo data. Override with env vars so
// the "classroom" sits at your real position (phone scans then pass).
// Defaults to Bangalore with a 100m radius if not provided.
const SEED_GEOFENCE = {
  lat: parseFloat(process.env.SEED_GEOFENCE_LAT) || 12.9716,
  lon: parseFloat(process.env.SEED_GEOFENCE_LON) || 77.5946,
  radius: parseInt(process.env.SEED_GEOFENCE_RADIUS, 10) || 100,
};

const seedDatabase = async () => {
  logger.info('Clearing existing data...');
  await User.deleteMany({});
  await Course.deleteMany({});
  await Session.deleteMany({});
  await Enrollment.deleteMany({});

  logger.info(
    `Seeding demo geofence at lat ${SEED_GEOFENCE.lat}, lon ${SEED_GEOFENCE.lon}, radius ${SEED_GEOFENCE.radius}m`
  );

  const users = await seedUsers();
  const faculty = users.filter((u) => u.role === 'faculty');
  const students = users.filter((u) => u.role === 'student');

  const courses = await seedCourses(faculty, students);
  await seedSessions(courses);

  logger.info('Seed completed successfully!');
  logger.info('Default accounts:');
  logger.info('  Admin:     admin@college.edu / Admin@1234');
  logger.info('  Faculty:   faculty1@college.edu / Faculty@123');
  logger.info('  Student:   student1@college.edu / Student@123');
};

const main = async () => {
  try {
    await connectDB();
    await seedDatabase();
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed:', error);
    process.exit(1);
  }
};

export { seedDatabase };

// Only run as a standalone script (npm run db:seed), NOT when imported by
// server.js (which calls seedDatabase() directly). Importing must not trigger
// a second, uncontrolled seed run.
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  main();
}
