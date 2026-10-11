
const $ = id => document.getElementById(id);
const STORAGE_KEY = "submitTrack_v2";

const DEFAULT_DATA = {
  subjects: ["M3", "BCN", "No-Code AI"],
  tasks: []
};

let data;
let currentView = "dashboard";
let currentFilter = "all";
let activeSubject = null;
let editingTaskId = null;
let editingSubject = null;

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(DEFAULT_DATA);

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.subjects) ||
        !Array.isArray(parsed.tasks)) {
      return structuredClone(DEFAULT_DATA);
    }

    return {
      subjects: parsed.subjects.filter(s => typeof s === "string"),
      tasks: parsed.tasks.filter(t =>
        t && typeof t.id === "string" &&
        typeof t.title === "string" &&
        typeof t.subject === "string" &&
        typeof t.type === "string" &&
        typeof t.dueDate === "string" &&
        typeof t.completed === "boolean"
      )
    };
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

data = loadData();

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    alert("Data save nahi hua. Browser storage check karo.");
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(value) {
  if (!value) return "No deadline";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function isOverdue(task) {
  return !task.completed && task.dueDate < todayString();
}

// SUBJECT-WISE SUMMARY
function getSubjectStats(subject) {
  const tasks = data.tasks.filter(t => t.subject === subject);
  const assignments = tasks.filter(t => t.type === "Assignment");
  const practicals = tasks.filter(t => t.type === "Practical");

  const assignmentDone = assignments.filter(t => t.completed).length;
  const practicalDone = practicals.filter(t => t.completed).length;
  const completed = tasks.filter(t => t.completed).length;

  return {
    total: tasks.length,
    completed,
    pending: tasks.length - completed,
    assignments: assignments.length,
    assignmentDone,
    practicals: practicals.length,
    practicalDone,
    progress: tasks.length
      ? Math.round(completed / tasks.length * 100)
      : 0
  };
}

function renderSubjects() {
  const list = $("subject-list");

  if (!data.subjects.length) {
    list.innerHTML =
      '<div class="subject-empty">No subjects yet. Add your first subject to get started!</div>';
  } else {
    list.innerHTML = data.subjects.map(subject => {
      const s = getSubjectStats(subject);

      return `
        <article class="subject-card">
          <div class="subject-top">
            <div class="subject-symbol">▤</div>
            <div>
              <div class="subject-name">${escapeHTML(subject)}</div>
              <div class="subject-total">${s.total} total submissions</div>
            </div>
          </div>

          <div class="subject-stats">
            <span>Assignments</span>
            <strong>${s.assignmentDone} / ${s.assignments}</strong>
            <span>Practicals</span>
            <strong>${s.practicalDone} / ${s.practicals}</strong>
            <span>All completed</span>
            <strong>${s.completed} / ${s.total}</strong>
          </div>

          <div class="subject-progress">
            <div class="subject-progress-label">
              <span>Subject progress</span>
              <strong>${s.progress}%</strong>
            </div>
            <div class="progress-track">
              <div style="width:${s.progress}%"></div>
            </div>
          </div>

          <div class="subject-actions">
            <button class="small-btn" data-action="view-subject"
              data-subject="${escapeHTML(subject)}">View tasks</button>
            <button class="small-btn" data-action="edit-subject"
              data-subject="${escapeHTML(subject)}">Edit</button>
            <button class="small-btn danger" data-action="delete-subject"
              data-subject="${escapeHTML(subject)}">Delete</button>
          </div>
        </article>`;
    }).join("");
  }

  const previous = $("task-subject").value;

  $("task-subject").innerHTML =
    '<option value="">Select a subject</option>' +
    data.subjects.map(subject =>
      `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`
    ).join("");

  if (data.subjects.includes(previous)) {
    $("task-subject").value = previous;
  } else if (data.subjects.length) {
    $("task-subject").value = data.subjects[0];
  }
}

function renderStats() {
  const total = data.tasks.length;
  const completed = data.tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const progress = total ? Math.round(completed / total * 100) : 0;

  $("total-count").textContent = total;
  $("completed-count").textContent = completed;
  $("pending-count").textContent = pending;
  $("progress-count").textContent = progress + "%";
}

function getVisibleTasks() {
  const search = $("search").value.trim().toLowerCase();

  return data.tasks.filter(task => {
    const matchesView =
      currentView === "dashboard" ||
      currentView === "all" ||
      (currentView === "assignments" && task.type === "Assignment") ||
      (currentView === "practicals" && task.type === "Practical") ||
      (currentView === "subject" && task.subject === activeSubject);

    const matchesFilter =
      currentFilter === "all" ||
      task.type === currentFilter ||
      (currentFilter === "pending" && !task.completed) ||
      (currentFilter === "completed" && task.completed);

    const matchesSearch = [
      task.title, task.subject, task.type, task.notes || ""
    ].join(" ").toLowerCase().includes(search);

    return matchesView && matchesFilter && matchesSearch;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function renderTasks() {
  const tasks = getVisibleTasks();

  if (!tasks.length) {
    $("task-list").innerHTML = `
      <div class="empty">
        <div style="font-size:28px;margin-bottom:10px">✦</div>
        <strong>No submissions found</strong>
        <p>Add a task or change your filters to see submissions here.</p>
      </div>`;
    return;
  }

  $("task-list").innerHTML = tasks.map(task => {
    const overdue = isOverdue(task);
    const status = task.completed
      ? "completed"
      : overdue ? "overdue" : "pending";
    const statusText = task.completed
      ? "Completed"
      : overdue ? "Overdue" : "Pending";

    return `
      <article class="task-row">
        <div class="task-main">
          <div class="task-title-line">
            <h4>${escapeHTML(task.title)}</h4>
            <span class="task-type">${escapeHTML(task.type)}</span>
          </div>
          <p>${escapeHTML(task.subject)} · Due ${formatDate(task.dueDate)}</p>
          ${task.notes
            ? `<p>${escapeHTML(task.notes)}</p>`
            : ""}
        </div>

        <div class="task-controls">
          <span class="status ${status}">${statusText}</span>
          <div class="task-actions">
            <button class="small-btn"
              data-action="toggle-task" data-id="${task.id}">
              ${task.completed ? "Undo" : "✓ Complete"}
            </button>
            <button class="small-btn"
              data-action="edit-task" data-id="${task.id}">Edit</button>
            <button class="small-btn danger"
              data-action="delete-task" data-id="${task.id}">Delete</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function updatePage() {
  const titles = {
    dashboard: "Dashboard",
    subjects: "My Subjects",
    assignments: "Assignments",
    practicals: "Practicals",
    all: "All Submissions",
    subject: activeSubject || "Subject"
  };

  $("page-title").textContent = titles[currentView];

  $("list-heading").textContent =
    currentView === "subject"
      ? `${activeSubject} — Submissions`
      : currentView === "dashboard"
        ? "All submissions"
        : titles[currentView];

  $("active-subject-banner").classList.toggle(
    "hidden", currentView !== "subject"
  );

  $("active-subject-banner").textContent =
    currentView === "subject"
      ? `Viewing only submissions for ${activeSubject}`
      : "";

  $("subject-panel").classList.toggle(
    "hidden", !["dashboard", "subjects"].includes(currentView)
  );

  $("task-form-panel").classList.toggle(
    "hidden", currentView === "subjects"
  );

  $("submission-panel").classList.toggle(
    "hidden", currentView === "subjects"
  );

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === currentView ||
      (currentView === "subject" && button.dataset.view === "subjects")
    );
  });
}

function renderAll() {
  renderSubjects();
  renderStats();
  updatePage();
  renderTasks();
}

// SUBJECT FORM
$("add-subject-btn").addEventListener("click", () => {
  editingSubject = null;
  $("subject-name").value = "";
  $("save-subject-btn").textContent = "Save subject";
  $("subject-form").classList.remove("hidden");
  $("subject-name").focus();
});

$("cancel-subject").addEventListener("click", () => {
  editingSubject = null;
  $("subject-form").classList.add("hidden");
});

$("subject-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("subject-name").value.trim();
  if (!name) return;

  const duplicate = data.subjects.some(s =>
    s.toLowerCase() === name.toLowerCase() && s !== editingSubject
  );

  if (duplicate) {
    alert("Ye subject pehle se exist karta hai.");
    return;
  }

  if (editingSubject) {
    data.subjects = data.subjects.map(s =>
      s === editingSubject ? name : s
    );
    data.tasks.forEach(task => {
      if (task.subject === editingSubject) task.subject = name;
    });

    if (activeSubject === editingSubject) activeSubject = name;
  } else {
    data.subjects.push(name);
  }

  if (!saveData()) return;

  editingSubject = null;
  $("subject-name").value = "";
  $("subject-form").classList.add("hidden");
  renderAll();
});

// SUBJECT CARD ACTIONS
$("subject-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const name = button.dataset.subject;
  const action = button.dataset.action;

  if (action === "view-subject") {
    activeSubject = name;
    currentView = "subject";
    currentFilter = "all";
    $("search").value = "";
    resetFilterButtons();
    renderAll();
    $("submission-panel").scrollIntoView({ behavior: "smooth" });
  }

  if (action === "edit-subject") {
    editingSubject = name;
    $("subject-name").value = name;
    $("save-subject-btn").textContent = "Save changes";
    $("subject-form").classList.remove("hidden");
    $("subject-name").focus();
  }

  if (action === "delete-subject") {
    const count = data.tasks.filter(t => t.subject === name).length;
    const message = count
      ? `Delete "${name}" and all its ${count} tasks? This cannot be undone.`
      : `Delete subject "${name}"?`;

    if (!confirm(message)) return;

    data.subjects = data.subjects.filter(s => s !== name);
    data.tasks = data.tasks.filter(t => t.subject !== name);

    if (activeSubject === name) {
      activeSubject = null;
      currentView = "subjects";
    }

    if (saveData()) renderAll();
  }
});

// TASK FORM
function resetTaskForm() {
  editingTaskId = null;
  $("task-form").reset();
  $("form-heading").textContent = "Add a new submission";
  $("save-task-btn").textContent = "＋ Add submission";
  $("cancel-edit").classList.add("hidden");
  renderSubjects();
}

$("task-form").addEventListener("submit", event => {
  event.preventDefault();

  const title = $("task-title").value.trim();
  const subject = $("task-subject").value;
  const type = $("task-type").value;
  const dueDate = $("task-date").value;
  const notes = $("task-notes").value.trim();

  if (!title || !subject || !dueDate) {
    alert("Title, subject aur deadline fill karo.");
    return;
  }

  if (!data.subjects.includes(subject)) {
    alert("Pehle valid subject select karo.");
    return;
  }

  const taskData = { title, subject, type, dueDate, notes };

  if (editingTaskId) {
    const task = data.tasks.find(t => t.id === editingTaskId);
    if (!task) return;
    Object.assign(task, taskData);
  } else {
    data.tasks.push({
      id: newId(),
      ...taskData,
      completed: false
    });
  }

  if (!saveData()) return;

  $("form-message").textContent = editingTaskId
    ? "Changes saved successfully!"
    : "Submission added successfully!";

  resetTaskForm();
  renderAll();
});

$("cancel-edit").addEventListener("click", resetTaskForm);

// TASK ACTIONS
$("task-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const task = data.tasks.find(t => t.id === button.dataset.id);
  if (!task) return;

  switch (button.dataset.action) {
    case "toggle-task":
      task.completed = !task.completed;
      break;

    case "delete-task":
      if (!confirm(`Delete "${task.title}"?`)) return;
      data.tasks = data.tasks.filter(t => t.id !== task.id);
      break;

    case "edit-task":
      editingTaskId = task.id;
      $("task-title").value = task.title;
      $("task-subject").value = task.subject;
      $("task-type").value = task.type;
      $("task-date").value = task.dueDate;
      $("task-notes").value = task.notes || "";
      $("form-heading").textContent = "Edit submission";
      $("save-task-btn").textContent = "Save changes";
      $("cancel-edit").classList.remove("hidden");
      $("task-form-panel").scrollIntoView({ behavior: "smooth" });
      return;
  }

  if (saveData()) renderAll();
});

// FILTERS AND SEARCH
function resetFilterButtons() {
  document.querySelectorAll(".filter").forEach(button => {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  });
}

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    resetFilterButtons();
    renderTasks();
  });
});

$("search").addEventListener("input", renderTasks);

// NAVIGATION
document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    activeSubject = null;
    currentFilter = "all";
    $("search").value = "";
    resetFilterButtons();
    renderAll();

    const target = currentView === "subjects"
      ? "subject-panel"
      : currentView === "dashboard"
        ? "subject-panel"
        : "submission-panel";

    $(target).scrollIntoView({ behavior: "smooth" });
  });
});

$("jump-to-form").addEventListener("click", () => {
  $("task-form-panel").scrollIntoView({ behavior: "smooth" });
  $("task-title").focus({ preventScroll: true });
});

// THEME
$("theme-btn").addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  $("theme-btn").textContent = isDark ? "☀" : "☾";

  try {
    localStorage.setItem("submitTrack_theme", isDark ? "dark" : "light");
  } catch {}
});

try {
  if (localStorage.getItem("submitTrack_theme") === "dark") {
    document.body.classList.add("dark");
    $("theme-btn").textContent = "☀";
  }
} catch {}

renderAll();
