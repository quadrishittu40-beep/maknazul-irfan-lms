const API_BASE = "/api";

const state = {
  user: null,
  courses: [],
  currentCourse: null,
  currentLecture: null
};

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type = "info") {
  let box = $("#app-message");

  if (!box) {
    box = document.createElement("div");
    box.id = "app-message";
    box.style.cssText =
      "position:fixed;top:20px;right:20px;z-index:9999;max-width:360px;padding:14px 18px;border-radius:10px;font-weight:600;box-shadow:0 4px 15px rgba(0,0,0,.15);";
    document.body.appendChild(box);
  }

  box.textContent = message;
  box.style.background =
    type === "error"
      ? "#b42318"
      : type === "success"
      ? "#067647"
      : "#175cd3";
  box.style.color = "#fff";

  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.remove(), 4000);
}

async function api(path, options = {}) {
  const config = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  try {
    const response = await fetch(`${API_BASE}${path}`, config);

    let data = {};
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`
      );
    }

    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/* =========================
   AUTHENTICATION
========================= */

async function getCurrentUser() {
  try {
    const result = await api("/auth/me");
    state.user = result.user || result.data || result;
    return state.user;
  } catch {
    state.user = null;
    return null;
  }
}

async function registerUser(form) {
  const payload = {
    firstName: form.firstName.value.trim(),
    lastName: form.lastName.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value,
    phone: form.phone?.value.trim() || undefined,
    dateOfBirth: form.dateOfBirth?.value || undefined,
    gender: form.gender?.value || undefined,
    guardianName: form.guardianName?.value.trim() || undefined,
    guardianPhone: form.guardianPhone?.value.trim() || undefined,
    levelId: form.levelId?.value || undefined,
    classId: form.classId?.value || undefined
  };

  try {
    const result = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    showMessage(
      result.message ||
        "Registration successful. Your account is awaiting approval.",
      "success"
    );

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1500);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loginUser(form) {
  const payload = {
    email: form.email.value.trim(),
    password: form.password.value
  };

  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.user = result.user || result.data || result;

    showMessage("Login successful.", "success");

    const role = state.user.role;

    setTimeout(() => {
      if (role === "ADMIN") {
        window.location.href = "admin.html";
      } else if (role === "TEACHER") {
        window.location.href = "teacher.html";
      } else {
        window.location.href = "student.html";
      }
    }, 700);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function logoutUser() {
  try {
    await api("/auth/logout", {
      method: "POST"
    });
  } catch (error) {
    console.error(error);
  }

  state.user = null;
  window.location.href = "index.html";
}

/* =========================
   LEVELS / CLASSES
========================= */

async function loadLevels(selectSelector) {
  try {
    const result = await api("/academic/levels");
    const levels = result.levels || result.data || result || [];
    const select = $(selectSelector);

    if (!select) return;

    select.innerHTML =
      '<option value="">Select level</option>' +
      levels
        .map(
          level =>
            `<option value="${escapeHtml(level.id)}">${escapeHtml(
              level.name
            )}</option>`
        )
        .join("");

    return levels;
  } catch (error) {
    console.error(error);
  }
}

async function loadClasses(levelId, selectSelector) {
  if (!levelId) return;

  try {
    const result = await api(
      `/academic/classes?levelId=${encodeURIComponent(levelId)}`
    );

    const classes = result.classes || result.data || result || [];
    const select = $(selectSelector);

    if (!select) return;

    select.innerHTML =
      '<option value="">Select class</option>' +
      classes
        .map(
          item =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(
              item.name
            )}</option>`
        )
        .join("");

    return classes;
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   COURSES
========================= */

async function loadCourses() {
  try {
    const result = await api("/academic/courses");
    state.courses = result.courses || result.data || result || [];

    renderCourses(state.courses);

    return state.courses;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

function renderCourses(courses) {
  const containers = $$(".course-list");

  containers.forEach(container => {
    if (!courses.length) {
      container.innerHTML =
        '<p class="empty-state">No courses are available yet.</p>';
      return;
    }

    container.innerHTML = courses
      .map(
        course => `
        <article class="course-card">
          <div class="course-card-body">
            <h3>${escapeHtml(course.title)}</h3>
            <p>${escapeHtml(course.description || "")}</p>

            <div class="course-meta">
              ${
                course.subject
                  ? `<span>${escapeHtml(course.subject.name)}</span>`
                  : ""
              }

              ${
                course.price !== null && course.price !== undefined
                  ? `<span>${escapeHtml(
                      course.currency || "NGN"
                    )} ${escapeHtml(course.price)}`
                  : `<span>Free</span>`
              }
            </div>

            <button
              type="button"
              class="btn"
              onclick="openCourse('${escapeHtml(course.id)}')"
            >
              View Course
            </button>
          </div>
        </article>
      `
      )
      .join("");
  });
}

async function openCourse(courseId) {
  try {
    const result = await api(`/academic/courses/${courseId}`);

    state.currentCourse = result.course || result.data || result;

    sessionStorage.setItem(
      "currentCourse",
      JSON.stringify(state.currentCourse)
    );

    window.location.href = `course.html?id=${encodeURIComponent(courseId)}`;
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadCoursePage(courseId) {
  try {
    const result = await api(`/academic/courses/${courseId}`);
    const course = result.course || result.data || result;

    state.currentCourse = course;

    const title = $("#course-title");
    const description = $("#course-description");

    if (title) title.textContent = course.title || "Course";
    if (description) {
      description.textContent = course.description || "";
    }

    await loadLectures(courseId);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

/* =========================
   ENROLLMENT
========================= */

async function checkCourseAccess(courseId) {
  try {
    return await api(`/enrollment/${courseId}/access`);
  } catch {
    return null;
  }
}

async function enrollInCourse(courseId) {
  try {
    const result = await api(`/enrollment/${courseId}`, {
      method: "POST"
    });

    showMessage(
      result.message || "You are now enrolled in this course.",
      "success"
    );

    await loadMyCourses();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadMyCourses() {
  try {
    const result = await api("/enrollment/my-courses");
    const courses = result.courses || result.data || result || [];

    const containers = $$(".my-course-list");

    containers.forEach(container => {
      if (!courses.length) {
        container.innerHTML =
          '<p class="empty-state">You are not enrolled in any course yet.</p>';
        return;
      }

      container.innerHTML = courses
        .map(
          enrollment => {
            const course = enrollment.course || enrollment;

            return `
              <article class="course-card">
                <h3>${escapeHtml(course.title)}</h3>
                <p>${escapeHtml(course.description || "")}</p>
                <button
                  type="button"
                  class="btn"
                  onclick="openCourse('${escapeHtml(course.id)}')"
                >
                  Continue Learning
                </button>
              </article>
            `;
          }
        )
        .join("");
    });

    return courses;
  } catch (error) {
    console.error(error);
    return [];
  }
}

/* =========================
   LECTURES
========================= */

async function loadLectures(courseId) {
  try {
    const result = await api(`/lectures/course/${courseId}`);
    const lectures = result.lectures || result.data || result || [];

    const containers = $$(".lecture-list");

    containers.forEach(container => {
      if (!lectures.length) {
        container.innerHTML =
          '<p class="empty-state">No lectures have been published yet.</p>';
        return;
      }

      container.innerHTML = lectures
        .map(
          (lecture, index) => `
            <div class="lecture-item">
              <div>
                <strong>${index + 1}. ${escapeHtml(
                  lecture.title
                )}</strong>
                <p>${escapeHtml(lecture.description || "")}</p>
              </div>

              <button
                type="button"
                class="btn"
                onclick="openLecture('${escapeHtml(lecture.id)}')"
              >
                Open
              </button>
            </div>
          `
        )
        .join("");
    });

    return lectures;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

async function openLecture(lectureId) {
  try {
    const result = await api(`/lectures/${lectureId}`);
    const lecture = result.lecture || result.data || result;

    state.currentLecture = lecture;

    sessionStorage.setItem(
      "currentLecture",
      JSON.stringify(lecture)
    );

    window.location.href = `lecture.html?id=${encodeURIComponent(lectureId)}`;
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadLecturePage(lectureId) {
  try {
    const result = await api(`/lectures/${lectureId}`);
    const lecture = result.lecture || result.data || result;

    state.currentLecture = lecture;

    if ($("#lecture-title")) {
      $("#lecture-title").textContent = lecture.title || "Lecture";
    }

    if ($("#lecture-description")) {
      $("#lecture-description").textContent =
        lecture.description || "";
    }

    if ($("#lecture-content")) {
      $("#lecture-content").innerHTML =
        lecture.content || "<p>No lecture content available.</p>";
    }

    const video = $("#lecture-video");

    if (video && lecture.videoUrl) {
      video.src = lecture.videoUrl;
      video.style.display = "block";
    }

    renderLectureMaterials(lecture.materials || []);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function renderLectureMaterials(materials) {
  const container = $("#lecture-materials");

  if (!container) return;

  if (!materials.length) {
    container.innerHTML = "<p>No materials attached.</p>";
    return;
  }

  container.innerHTML = materials
    .map(
      material => `
        <div class="material-item">
          <span>${escapeHtml(material.title)}</span>
          <button
            type="button"
            class="btn"
            onclick="downloadMaterial('${escapeHtml(material.id)}')"
          >
            Open
          </button>
        </div>
      `
    )
    .join("");
}

async function downloadMaterial(materialId) {
  try {
    const result = await api(
      `/lectures/materials/${materialId}/url`
    );

    const url =
      result.url ||
      result.data?.url ||
      result.downloadUrl;

    if (!url) {
      throw new Error("Material URL was not returned.");
    }

    window.open(url, "_blank");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

/* =========================
   PROGRESS
========================= */

async function startLecture(lectureId) {
  try {
    await api(`/progress/lecture/${lectureId}/start`, {
      method: "POST"
    });
  } catch (error) {
    console.error(error);
  }
}

async function updateVideoProgress(
  lectureId,
  videoPositionSeconds
) {
  try {
    await api(`/progress/lecture/${lectureId}/video`, {
      method: "PATCH",
      body: JSON.stringify({
        videoPositionSeconds
      })
    });
  } catch (error) {
    console.error(error);
  }
}

async function completeLecture(lectureId) {
  try {
    await api(`/progress/lecture/${lectureId}/complete`, {
      method: "POST"
    });

    showMessage("Lecture completed.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadCourseProgress(courseId) {
  try {
    const result = await api(`/progress/course/${courseId}`);

    const progress = result.progress || result.data || result;

    const bar = $("#course-progress-bar");
    const text = $("#course-progress-text");

    if (bar && progress.percentage !== undefined) {
      bar.value = Number(progress.percentage);
    }

    if (text && progress.percentage !== undefined) {
      text.textContent = `${progress.percentage}% completed`;
    }

    return progress;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/* =========================
   TESTS
========================= */

async function loadTests(courseId) {
  try {
    const query = courseId
      ? `?courseId=${encodeURIComponent(courseId)}`
      : "";

    const result = await api(`/exams/tests${query}`);
    const tests = result.tests || result.data || result || [];

    const containers = $$(".test-list");

    containers.forEach(container => {
      if (!tests.length) {
        container.innerHTML =
          '<p class="empty-state">No tests available.</p>';
        return;
      }

      container.innerHTML = tests
        .map(
          test => `
            <div class="test-item">
              <div>
                <h3>${escapeHtml(test.title)}</h3>
                <p>${escapeHtml(test.description || "")}</p>
                <small>
                  Duration: ${escapeHtml(test.durationMinutes)} minutes
                </small>
              </div>

              <button
                type="button"
                class="btn"
                onclick="startTest('${escapeHtml(test.id)}')"
              >
                Start Test
              </button>
            </div>
          `
        )
        .join("");
    });

    return tests;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

async function startTest(testId) {
  try {
    const result = await api(`/exams/tests/${testId}/start`, {
      method: "POST"
    });

    const attempt = result.attempt || result.data || result;

    sessionStorage.setItem(
      "currentAttempt",
      JSON.stringify(attempt)
    );

    window.location.href =
      `tests.html?attempt=${encodeURIComponent(attempt.id)}`;
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function submitTest(attemptId, answers) {
  try {
    const result = await api(
      `/exams/attempts/${attemptId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({ answers })
      }
    );

    showMessage(
      result.message || "Test submitted successfully.",
      "success"
    );

    setTimeout(() => {
      window.location.href = "results.html";
    }, 1000);

    return result;
  } catch (error) {
    showMessage(error.message, "error");
    return null;
  }
}

/* =========================
   RESULTS
========================= */

async function loadMyResults() {
  try {
    const result = await api("/exams/results/me");
    const results = result.results || result.data || result || [];

    const containers = $$(".results-list");

    containers.forEach(container => {
      if (!results.length) {
        container.innerHTML =
          '<p class="empty-state">No examination results yet.</p>';
        return;
      }

      container.innerHTML = results
        .map(
          item => `
            <div class="result-card">
              <h3>${escapeHtml(
                item.test?.title || item.testTitle || "Examination"
              )}</h3>

              <p>
                Score:
                <strong>${escapeHtml(
                  item.percentage ?? item.score ?? "-"
                )}%</strong>
              </p>

              <p>
                Grade:
                <strong>${escapeHtml(item.grade || "-")}</strong>
              </p>

              <p>
                Status:
                ${item.passed ? "Passed" : "Not Passed"}
              </p>
            </div>
          `
        )
        .join("");
    });

    return results;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

/* =========================
   PAYMENTS
========================= */

async function initializePayment(courseId, callbackUrl) {
  try {
    const result = await api("/payments/initialize", {
      method: "POST",
      body: JSON.stringify({
        courseId,
        callbackUrl
      })
    });

    const authorizationUrl =
      result.authorizationUrl ||
      result.data?.authorizationUrl;

    if (!authorizationUrl) {
      throw new Error("Payment URL was not returned.");
    }

    window.location.href = authorizationUrl;
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function verifyPayment(reference) {
  try {
    const result = await api(
      `/payments/verify/${encodeURIComponent(reference)}`
    );

    showMessage(
      result.message || "Payment verified successfully.",
      "success"
    );

    return result;
  } catch (error) {
    showMessage(error.message, "error");
    return null;
  }
}

async function loadMyPayments() {
  try {
    const result = await api("/payments/my");
    const payments = result.payments || result.data || result || [];

    const containers = $$(".payment-list");

    containers.forEach(container => {
      if (!payments.length) {
        container.innerHTML =
          "<p>No payment records available.</p>";
        return;
      }

      container.innerHTML = payments
        .map(
          payment => `
            <div class="payment-card">
              <strong>${escapeHtml(payment.reference)}</strong>
              <p>
                ${escapeHtml(payment.currency || "NGN")}
                ${escapeHtml(payment.amount)}
              </p>
              <p>Status: ${escapeHtml(payment.status)}</p>
            </div>
          `
        )
        .join("");
    });

    return payments;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

/* =========================
   LIVE CLASSES
========================= */

async function loadLiveClasses() {
  try {
    const result = await api("/live-classes");
    const classes =
      result.liveClasses ||
      result.classes ||
      result.data ||
      result ||
      [];

    const containers = $$(".live-class-list");

    containers.forEach(container => {
      if (!classes.length) {
        container.innerHTML =
          "<p>No live classes scheduled.</p>";
        return;
      }

      container.innerHTML = classes
        .map(
          liveClass => `
            <div class="live-class-card">
              <h3>${escapeHtml(liveClass.title)}</h3>

              <p>${escapeHtml(
                liveClass.description || ""
              )}</p>

              <p>
                ${formatDate(liveClass.scheduledStart)}
                -
                ${formatDate(liveClass.scheduledEnd)}
              </p>

              ${
                liveClass.meetingUrl
                  ? `
                    <a
                      class="btn"
                      href="${escapeHtml(
                        liveClass.meetingUrl
                      )}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join Class
                    </a>
                  `
                  : ""
              }
            </div>
          `
        )
        .join("");
    });

    return classes;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

/* =========================
   CERTIFICATES
========================= */

async function loadCertificates() {
  try {
    const result = await api("/certificates/my");
    const certificates =
      result.certificates || result.data || result || [];

    const containers = $$(".certificate-list");

    containers.forEach(container => {
      if (!certificates.length) {
        container.innerHTML =
          "<p>No certificates have been issued yet.</p>";
        return;
      }

      container.innerHTML = certificates
        .map(
          certificate => `
            <div class="certificate-card">
              <h3>Certificate of Completion</h3>

              <p>
                Certificate No:
                <strong>${escapeHtml(
                  certificate.certificateNumber
                )}</strong>
              </p>

              <p>
                Issued:
                ${formatDate(certificate.issuedAt)}
              </p>

              ${
                certificate.certificateUrl
                  ? `
                    <a
                      class="btn"
                      href="${escapeHtml(
                        certificate.certificateUrl
                      )}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Certificate
                    </a>
                  `
                  : ""
              }
            </div>
          `
        )
        .join("");
    });

    return certificates;
  } catch (error) {
    console.error(error);
    return [];
  }
}

/* =========================
   NOTIFICATIONS
========================= */

async function loadNotifications() {
  try {
    const result = await api("/notifications");
    const notifications =
      result.notifications || result.data || result || [];

    const containers = $$(".notification-list");

    containers.forEach(container => {
      if (!notifications.length) {
        container.innerHTML =
          "<p>No notifications.</p>";
        return;
      }

      container.innerHTML = notifications
        .map(
          notification => `
            <div class="notification-card ${
              notification.read ? "read" : "unread"
            }">
              <h3>${escapeHtml(notification.title)}</h3>
              <p>${escapeHtml(notification.message)}</p>
              <small>${formatDate(
                notification.createdAt
              )}</small>
            </div>
          `
        )
        .join("");
    });

    return notifications;
  } catch (error) {
    console.error(error);
    return [];
  }
}

/* =========================
   DASHBOARD
========================= */

async function loadStudentDashboard() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  if (user.role !== "STUDENT") {
    redirectByRole(user);
    return;
  }

  const nameElement = $("#student-name");

  if (nameElement) {
    nameElement.textContent =
      `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }

  await Promise.all([
    loadMyCourses(),
    loadMyResults(),
    loadMyPayments(),
    loadLiveClasses(),
    loadCertificates(),
    loadNotifications()
  ]);
}

function redirectByRole(user) {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  if (user.role === "ADMIN") {
    window.location.href = "admin.html";
  } else if (user.role === "TEACHER") {
    window.location.href = "teacher.html";
  } else {
    window.location.href = "student.html";
  }
}

/* =========================
   ADMIN
========================= */

async function loadAdminStudents() {
  try {
    const result = await api("/admin/students");
    const students =
      result.students || result.data || result || [];

    const container = $(".admin-student-list");

    if (!container) return students;

    if (!students.length) {
      container.innerHTML = "<p>No students found.</p>";
      return students;
    }

    container.innerHTML = students
      .map(
        student => `
          <div class="student-row">
            <div>
              <strong>
                ${escapeHtml(
                  `${student.user?.firstName || ""} ${
                    student.user?.lastName || ""
                  }`
                )}
              </strong>

              <small>
                ${escapeHtml(student.user?.email || "")}
              </small>
            </div>

            <span>
              ${escapeHtml(student.status || "")}
            </span>
          </div>
        `
      )
      .join("");

    return students;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

/* =========================
   TEACHER
========================= */

async function loadTeacherCourses() {
  try {
    const result = await api("/academic/courses");
    const courses = result.courses || result.data || result || [];

    const container = $(".teacher-course-list");

    if (!container) return courses;

    container.innerHTML = courses
      .map(
        course => `
          <div class="course-card">
            <h3>${escapeHtml(course.title)}</h3>
            <p>${escapeHtml(course.description || "")}</p>
            <button
              class="btn"
              type="button"
              onclick="openCourse('${escapeHtml(course.id)}')"
            >
              Manage Course
            </button>
          </div>
        `
      )
      .join("");

    return courses;
  } catch (error) {
    showMessage(error.message, "error");
    return [];
  }
}

/* =========================
   UTILITIES
========================= */

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function bindForm(selector, handler) {
  const form = $(selector);

  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();
    handler(form);
  });
}

/* =========================
   PAGE INITIALISATION
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  bindForm("#login-form", loginUser);
  bindForm("#register-form", registerUser);

  $$(".logout-button").forEach(button => {
    button.addEventListener("click", logoutUser);
  });

  const levelSelect = $("#levelId");

  if (levelSelect) {
    await loadLevels("#levelId");

    levelSelect.addEventListener("change", () => {
      loadClasses(levelSelect.value, "#classId");
    });
  }

  if ($(".course-list")) {
    await loadCourses();
  }

  if ($(".my-course-list")) {
    await loadMyCourses();
  }

  if ($(".results-list")) {
    await loadMyResults();
  }

  if ($(".payment-list")) {
    await loadMyPayments();
  }

  if ($(".live-class-list")) {
    await loadLiveClasses();
  }

  if ($(".certificate-list")) {
    await loadCertificates();
  }

  if ($(".notification-list")) {
    await loadNotifications();
  }

  if ($(".admin-student-list")) {
    const user = await getCurrentUser();

    if (user?.role === "ADMIN") {
      await loadAdminStudents();
    }
  }

  if ($(".teacher-course-list")) {
    const user = await getCurrentUser();

    if (user?.role === "TEACHER" || user?.role === "ADMIN") {
      await loadTeacherCourses();
    }
  }

  const courseId = getQueryParam("id");

  if (courseId && $("#course-title")) {
    await loadCoursePage(courseId);
    await loadCourseProgress(courseId);
  }

  const lectureId = getQueryParam("id");

  if (lectureId && $("#lecture-title")) {
    await loadLecturePage(lectureId);
    await startLecture(lectureId);
  }
});

/* =========================
   GLOBAL API
========================= */

window.api = api;
window.openCourse = openCourse;
window.openLecture = openLecture;
window.downloadMaterial = downloadMaterial;
window.enrollInCourse = enrollInCourse;
window.initializePayment = initializePayment;
window.verifyPayment = verifyPayment;
window.startTest = startTest;
window.submitTest = submitTest;
window.completeLecture = completeLecture;
window.updateVideoProgress = updateVideoProgress;
window.logoutUser = logoutUser;
window.loadCourses = loadCourses;
window.loadMyCourses = loadMyCourses;
window.loadMyResults = loadMyResults;
window.loadMyPayments = loadMyPayments;
window.loadLiveClasses = loadLiveClasses;
window.loadCertificates = loadCertificates;
window.loadNotifications = loadNotifications;