import api from "./axios.js";

export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  logout: () => api.post("/auth/logout"),
  refresh: () => api.post("/auth/refresh"),
  getMe: () => api.get("/auth/me"),
  updateProfile: (data) => api.patch("/auth/update-profile", data),
  changePassword: (data) => api.post("/auth/change-password", data),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (data) => api.post("/auth/reset-password", data),
};

export const userAPI = {
  getAll: (params = {}) => api.get("/users", { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  deactivate: (id) => api.delete(`/users/${id}`),
  getFaculty: () => api.get("/users/faculty"),
  getStudents: (params = {}) => api.get("/users/students", { params }),
  getAttendance: (id, params = {}) =>
    api.get(`/users/${id}/attendance`, { params }),
};

export const courseAPI = {
  getAll: (params = {}) => api.get("/courses", { params }),
  getById: (id) => api.get(`/courses/${id}`),
  create: (data) => api.post("/courses", data),
  update: (id, data) => api.patch(`/courses/${id}`, data),
  delete: (id) => api.delete(`/courses/${id}`),
  browse: () => api.get("/courses/browse"),
  enrollSelf: (id) => api.post(`/courses/${id}/enroll-self`),
  unenrollSelf: (id) => api.delete(`/courses/${id}/enroll-self`),
  enroll: (id, studentIds) => api.post(`/courses/${id}/enroll`, { studentIds }),
  removeStudent: (id, studentId) =>
    api.delete(`/courses/${id}/enroll/${studentId}`),
  getStudents: (id) => api.get(`/courses/${id}/students`),
  getSessions: (id, params = {}) =>
    api.get(`/courses/${id}/sessions`, { params }),
  getAttendanceReport: (id) => api.get(`/courses/${id}/attendance-report`),
  getMyCourses: () => api.get("/courses/my-courses"),
  getDepartments: () => api.get("/courses/departments"),
  getAcademicYears: () => api.get("/courses/academic-years"),
};

export const sessionAPI = {
  getAll: (params = {}) => api.get("/sessions", { params }),
  getById: (id) => api.get(`/sessions/${id}`),
  create: (data) => api.post("/sessions", data),
  update: (id, data) => api.patch(`/sessions/${id}`, data),
  delete: (id) => api.delete(`/sessions/${id}`),
  start: (id) => api.post(`/sessions/${id}/start`),
  end: (id) => api.post(`/sessions/${id}/end`),
  getQR: (id) => api.get(`/sessions/${id}/qr`),
  getAttendance: (id, params = {}) =>
    api.get(`/sessions/${id}/attendance`, { params }),
  getActive: () => api.get("/sessions/active"),
  getUpcoming: () => api.get("/sessions/upcoming"),
  getToday: () => api.get("/sessions/today"),
};

export const attendanceAPI = {
  mark: (data) => api.post("/attendance/mark", data),
  markManual: (data) => api.post("/attendance/mark-manual", data),
  bulk: (data) => api.post("/attendance/bulk", data),
  update: (id, data) => api.patch(`/attendance/${id}`, data),
  getStudent: (studentId, params = {}) =>
    api.get(`/attendance/student/${studentId}`, { params }),
  getSession: (sessionId, params = {}) =>
    api.get(`/attendance/session/${sessionId}`, { params }),
  getSummary: (params = {}) => api.get("/attendance/summary", { params }),
  getStats: (courseId) => api.get(`/attendance/stats/${courseId}`),
  getLowAttendance: (params = {}) =>
    api.get("/attendance/low-attendance", { params }),
  export: (params = {}) =>
    api.get("/attendance/export", { params, responseType: "blob" }),
};

export const reportAPI = {
  getOverview: () => api.get("/reports/overview"),
  getFacultyReport: (id) => api.get(`/reports/faculty/${id}`),
  getStudentReport: (id) => api.get(`/reports/student/${id}`),
  getCourseReport: (courseId) => api.get(`/reports/course/${courseId}`),
  getDepartmentReport: (dept) => api.get(`/reports/department/${dept}`),
  getTrends: (params = {}) => api.get("/reports/trends", { params }),
  getLowAttendance: (params = {}) =>
    api.get("/reports/low-attendance", { params }),
  getAuditLogs: (params = {}) => api.get("/reports/audit-logs", { params }),
};
