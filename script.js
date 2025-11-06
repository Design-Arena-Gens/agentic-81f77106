const STORAGE_KEY = "advancedTaskManagerState";
const DEFAULT_TIMER_MINUTES = 25;

const state = {
  tasks: [],
  tags: [],
  preferences: {
    theme: "light",
    focusMode: false,
    timerSeconds: DEFAULT_TIMER_MINUTES * 60,
  },
};

let editingTaskId = null;
let currentFormTags = [];
let timerInterval = null;
let isTimerRunning = false;
let draggedTaskId = null;
let analyticsObserver = null;

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDomReferences();
  attachEventListeners();
  restoreState();
  initializeUI();
  setupParallax();
  setupLazyAnalytics();
});

function cacheDomReferences() {
  refs.body = document.body;
  refs.modeToggle = document.getElementById("modeToggle");
  refs.focusToggle = document.getElementById("focusToggle");
  refs.timerDisplay = document.getElementById("timerDisplay");
  refs.timerStart = document.getElementById("timerStart");
  refs.timerPause = document.getElementById("timerPause");
  refs.timerReset = document.getElementById("timerReset");
  refs.taskForm = document.getElementById("taskForm");
  refs.taskTitle = document.getElementById("taskTitle");
  refs.taskDescription = document.getElementById("taskDescription");
  refs.taskDueDate = document.getElementById("taskDueDate");
  refs.taskPriority = document.getElementById("taskPriority");
  refs.taskStatus = document.getElementById("taskStatus");
  refs.tagInput = document.getElementById("tagInput");
  refs.tagColor = document.getElementById("tagColor");
  refs.tagPreview = document.getElementById("tagPreview");
  refs.taskFormReset = document.getElementById("taskFormReset");
  refs.tasksContainer = document.getElementById("tasksContainer");
  refs.loadingState = document.getElementById("loadingState");
  refs.tasksCount = document.getElementById("tasksCount");
  refs.searchInput = document.getElementById("searchInput");
  refs.filterPriority = document.getElementById("filterPriority");
  refs.filterStatus = document.getElementById("filterStatus");
  refs.filterDate = document.getElementById("filterDate");
  refs.filterTags = document.getElementById("filterTags");
  refs.notificationList = document.getElementById("notificationList");
  refs.exportJSON = document.getElementById("exportJSON");
  refs.exportCSV = document.getElementById("exportCSV");
  refs.toast = document.getElementById("toast");
  refs.statusChart = document.getElementById("statusChart");
  refs.priorityChart = document.getElementById("priorityChart");
  refs.currentYear = document.getElementById("currentYear");
}

function attachEventListeners() {
  refs.modeToggle.addEventListener("click", toggleTheme);
  refs.focusToggle.addEventListener("click", toggleFocusMode);
  refs.timerStart.addEventListener("click", startTimer);
  refs.timerPause.addEventListener("click", pauseTimer);
  refs.timerReset.addEventListener("click", resetTimer);
  refs.taskForm.addEventListener("submit", handleTaskSubmit);
  refs.taskFormReset.addEventListener("click", resetTaskForm);
  refs.tagInput.addEventListener("keydown", handleTagInput);
  refs.tasksContainer.addEventListener("dragover", handleTaskDragOver);
  refs.tasksContainer.addEventListener("drop", handleTaskDrop);
  refs.tasksContainer.addEventListener("dragenter", (event) => event.preventDefault());
  refs.searchInput.addEventListener("input", renderTasks);
  [refs.filterPriority, refs.filterStatus, refs.filterDate].forEach((el) => el.addEventListener("input", renderTasks));
  refs.filterTags.addEventListener("change", renderTasks);
  refs.exportJSON.addEventListener("click", () => exportTasks("json"));
  refs.exportCSV.addEventListener("click", () => exportTasks("csv"));
}

function restoreState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return;
  }
  try {
    const data = JSON.parse(saved);
    if (Array.isArray(data.tasks)) {
      state.tasks = data.tasks;
    }
    if (Array.isArray(data.tags)) {
      state.tags = data.tags;
    }
    if (data.preferences) {
      Object.assign(state.preferences, data.preferences);
    }
  } catch (error) {
    console.error("Failed to parse stored state", error);
  }
}

function initializeUI() {
  refs.currentYear.textContent = new Date().getFullYear();
  applyTheme(state.preferences.theme);
  updateFocusModeUI();
  updateTimerDisplay();
  populateFilterTags();

  refs.loadingState.hidden = false;
  refs.tasksContainer.hidden = true;
  setTimeout(() => {
    refs.loadingState.hidden = true;
    refs.tasksContainer.hidden = false;
    renderTasks();
    refreshNotifications();
  }, 650);
}

function saveState() {
  const payload = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, payload);
}

function toggleTheme() {
  state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark";
  applyTheme(state.preferences.theme);
  saveState();
  showToast(state.preferences.theme === "dark" ? "تم تفعيل الوضع الليلي" : "تم تفعيل الوضع النهاري");
}

function applyTheme(theme) {
  refs.body.classList.toggle("dark", theme === "dark");
}

function toggleFocusMode() {
  const isActive = refs.focusToggle.getAttribute("aria-pressed") === "true";
  state.preferences.focusMode = !isActive;
  updateFocusModeUI();
  saveState();
  showToast(state.preferences.focusMode ? "تم تفعيل وضع التركيز" : "تم إلغاء وضع التركيز");
}

function updateFocusModeUI() {
  const active = state.preferences.focusMode;
  refs.focusToggle.setAttribute("aria-pressed", String(active));
  refs.body.classList.toggle("focus-mode", active);
}

function handleTaskSubmit(event) {
  event.preventDefault();
  if (!refs.taskTitle.value.trim()) {
    showToast("يرجى إدخال عنوان للمهمة");
    return;
  }

  const taskPayload = {
    id: editingTaskId ?? crypto.randomUUID(),
    title: refs.taskTitle.value.trim(),
    description: refs.taskDescription.value.trim(),
    dueDate: refs.taskDueDate.value || null,
    priority: refs.taskPriority.value,
    status: refs.taskStatus.value,
    tags: currentFormTags.slice(),
    createdAt: editingTaskId ? findTaskById(editingTaskId).createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: editingTaskId ? findTaskById(editingTaskId).order : state.tasks.length,
  };

  if (editingTaskId) {
    const index = state.tasks.findIndex((task) => task.id === editingTaskId);
    if (index > -1) {
      state.tasks[index] = taskPayload;
    }
  } else {
    state.tasks.push(taskPayload);
  }

  syncGlobalTags(taskPayload.tags);
  saveState();
  renderTasks();
  refreshNotifications();
  populateFilterTags();
  resetTaskForm();
  showToast(editingTaskId ? "تم تحديث المهمة" : "تم إضافة المهمة");
}

function handleTagInput(event) {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  const tagLabel = refs.tagInput.value.trim();
  if (!tagLabel) {
    return;
  }
  const tagColor = refs.tagColor.value;
  const tagExists = currentFormTags.some((tag) => tag.label === tagLabel);
  if (tagExists) {
    showToast("الوسم مضاف مسبقاً");
    return;
  }
  currentFormTags.push({ label: tagLabel, color: tagColor });
  refs.tagInput.value = "";
  renderFormTags();
}

function renderFormTags() {
  refs.tagPreview.innerHTML = "";
  currentFormTags.forEach((tag, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `حذف الوسم ${tag.label}`);
    button.innerHTML = "&times;";

    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.style.background = tag.color;
    chip.textContent = tag.label;
    chip.appendChild(button);

    button.addEventListener("click", () => {
      currentFormTags.splice(index, 1);
      renderFormTags();
    });

    refs.tagPreview.appendChild(chip);
  });
}

function resetTaskForm() {
  refs.taskForm.reset();
  editingTaskId = null;
  currentFormTags = [];
  refs.tagColor.value = "#4c6ef5";
  renderFormTags();
  refs.taskForm.querySelector("button.primary").textContent = "حفظ المهمة";
}

function findTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function renderTasks() {
  const filteredTasks = getFilteredTasks();
  refs.tasksContainer.innerHTML = "";

  const searchTerm = refs.searchInput.value.trim();
  filteredTasks
    .sort((a, b) => a.order - b.order)
    .forEach((task) => {
      const card = createTaskCard(task, searchTerm);
      refs.tasksContainer.appendChild(card);
    });

  refs.tasksCount.textContent = `إجمالي المهام: ${filteredTasks.length}`;
  updateAnalytics();
}

function getFilteredTasks() {
  const priorityFilter = refs.filterPriority.value;
  const statusFilter = refs.filterStatus.value;
  const dateFilter = refs.filterDate.value;
  const selectedTags = Array.from(refs.filterTags.selectedOptions).map((option) => option.value);
  const query = refs.searchInput.value.trim().toLowerCase();

  return state.tasks.filter((task) => {
    if (priorityFilter !== "all" && task.priority !== priorityFilter) {
      return false;
    }
    if (statusFilter !== "all" && task.status !== statusFilter) {
      return false;
    }
    if (dateFilter && task.dueDate !== dateFilter) {
      return false;
    }
    if (selectedTags.length) {
      const taskTagLabels = task.tags.map((tag) => tag.label);
      const containsAll = selectedTags.every((tag) => taskTagLabels.includes(tag));
      if (!containsAll) {
        return false;
      }
    }
    if (!query) {
      return true;
    }
    const stringToSearch = [task.title, task.description, ...task.tags.map((tag) => tag.label)].join(" ").toLowerCase();
    return stringToSearch.includes(query);
  });
}

function createTaskCard(task, searchTerm) {
  const li = document.createElement("li");
  li.className = "task-card";
  li.dataset.taskId = task.id;
  li.draggable = true;

  li.addEventListener("dragstart", handleTaskDragStart);
  li.addEventListener("dragend", handleTaskDragEnd);

  const titleContainer = document.createElement("div");
  titleContainer.className = "task-card__title";

  const title = document.createElement("h3");
  title.innerHTML = highlightMatches(task.title, searchTerm);

  const badgesWrapper = document.createElement("div");
  badgesWrapper.className = "task-card__badges";

  const priorityBadge = document.createElement("span");
  priorityBadge.className = `badge priority-${task.priority}`;
  priorityBadge.textContent = task.priority === "high" ? "أولوية مرتفعة" : task.priority === "medium" ? "أولوية متوسطة" : "أولوية منخفضة";

  const statusBadge = document.createElement("span");
  statusBadge.className = `badge status-${task.status}`;
  statusBadge.textContent =
    task.status === "todo" ? "قيد التخطيط" : task.status === "in-progress" ? "قيد التنفيذ" : "منجزة";

  badgesWrapper.append(priorityBadge, statusBadge);
  titleContainer.append(title, badgesWrapper);

  const description = document.createElement("p");
  description.innerHTML = highlightMatches(task.description || "لا يوجد وصف", searchTerm);
  description.className = "task-card__description";

  const meta = document.createElement("div");
  meta.className = "task-card__meta";
  if (task.dueDate) {
    const due = document.createElement("span");
    due.innerHTML = `<strong>تاريخ الاستحقاق:</strong> ${formatDate(task.dueDate)}`;
    meta.appendChild(due);
  }
  const created = document.createElement("span");
  created.innerHTML = `<strong>أضيفت:</strong> ${formatDate(task.createdAt)}`;
  meta.appendChild(created);

  const tagsContainer = document.createElement("div");
  tagsContainer.className = "task-card__tags";
  task.tags.forEach((tag) => {
    const tagElement = document.createElement("span");
    tagElement.className = "tag-chip";
    tagElement.style.background = tag.color;
    tagElement.innerHTML = highlightMatches(tag.label, searchTerm);
    tagsContainer.appendChild(tagElement);
  });

  const actions = document.createElement("div");
  actions.className = "task-card__actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "تعديل";
  editButton.addEventListener("click", () => populateTaskForEdit(task.id));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "حذف";
  deleteButton.addEventListener("click", () => deleteTask(task.id));

  actions.append(editButton, deleteButton);

  li.append(titleContainer, description, meta, tagsContainer, actions);
  return li;
}

function handleTaskDragStart(event) {
  draggedTaskId = event.currentTarget.dataset.taskId;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
}

function handleTaskDragOver(event) {
  event.preventDefault();
  const draggingElement = refs.tasksContainer.querySelector(".dragging");
  const target = event.target.closest(".task-card");
  if (!target || target === draggingElement) {
    return;
  }
  const cards = Array.from(refs.tasksContainer.children);
  const draggingIndex = cards.indexOf(draggingElement);
  const targetIndex = cards.indexOf(target);
  if (draggingIndex < targetIndex) {
    refs.tasksContainer.insertBefore(draggingElement, target.nextSibling);
  } else {
    refs.tasksContainer.insertBefore(draggingElement, target);
  }
}

function handleTaskDrop(event) {
  event.preventDefault();
  if (!draggedTaskId) {
    return;
  }
  const newOrder = Array.from(refs.tasksContainer.children).map((item, index) => ({
    id: item.dataset.taskId,
    order: index,
  }));
  newOrder.forEach((entry) => {
    const task = findTaskById(entry.id);
    if (task) {
      task.order = entry.order;
    }
  });
  saveState();
  renderTasks();
  draggedTaskId = null;
}

function handleTaskDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
}

function populateTaskForEdit(taskId) {
  const task = findTaskById(taskId);
  if (!task) {
    return;
  }
  editingTaskId = task.id;
  refs.taskTitle.value = task.title;
  refs.taskDescription.value = task.description;
  refs.taskDueDate.value = task.dueDate || "";
  refs.taskPriority.value = task.priority;
  refs.taskStatus.value = task.status;
  currentFormTags = task.tags.map((tag) => ({ ...tag }));
  renderFormTags();
  refs.taskForm.querySelector("button.primary").textContent = "تحديث المهمة";
  refs.taskTitle.focus();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  saveState();
  renderTasks();
  refreshNotifications();
  showToast("تم حذف المهمة");
}

function highlightMatches(text, searchTerm) {
  if (!searchTerm || !text) {
    return text || "";
  }
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  return text.replace(regex, (match) => `<mark>${match}</mark>`);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "تاريخ غير معروف";
  }
  return date.toLocaleDateString("ar-EG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function syncGlobalTags(tags) {
  tags.forEach((tag) => {
    const exists = state.tags.some((stored) => stored.label === tag.label);
    if (!exists) {
      state.tags.push(tag);
    }
  });
}

function populateFilterTags() {
  const uniqueLabels = [...new Set(state.tags.map((tag) => tag.label))];
  refs.filterTags.innerHTML = "";
  uniqueLabels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    refs.filterTags.appendChild(option);
  });
}

function refreshNotifications() {
  refs.notificationList.innerHTML = "";
  const now = new Date();
  const alerts = state.tasks
    .filter((task) => Boolean(task.dueDate) && task.status !== "done")
    .map((task) => {
      const due = new Date(task.dueDate);
      const diff = due - now;
      return { task, diff };
    })
    .filter(({ diff }) => diff <= 24 * 60 * 60 * 1000)
    .sort((a, b) => a.diff - b.diff);

  if (!alerts.length) {
    const placeholder = document.createElement("p");
    placeholder.textContent = "لا توجد مهام مستحقة قريباً";
    refs.notificationList.appendChild(placeholder);
    return;
  }

  alerts.slice(0, 5).forEach(({ task, diff }) => {
    const item = document.createElement("div");
    item.className = "notification";
    const message = document.createElement("div");
    message.innerHTML = `<strong>${task.title}</strong><br />المتبقي: ${formatRemainingTime(diff)}`;
    const time = document.createElement("time");
    time.dateTime = task.dueDate;
    time.textContent = formatDate(task.dueDate);
    item.append(message, time);
    refs.notificationList.appendChild(item);
  });
}

function formatRemainingTime(diff) {
  if (diff <= 0) {
    return "متأخرة";
  }
  const totalMinutes = Math.floor(diff / (1000 * 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} دقيقة`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ساعة${minutes > 0 ? ` و ${minutes} دقيقة` : ""}`;
}

function exportTasks(format) {
  if (!state.tasks.length) {
    showToast("لا توجد بيانات للتصدير");
    return;
  }
  let blob;
  let filename;
  if (format === "json") {
    blob = new Blob([JSON.stringify(state.tasks, null, 2)], { type: "application/json" });
    filename = "tasks-export.json";
  } else {
    const header = ["العنوان", "الوصف", "التاريخ", "الأولوية", "الحالة", "الوسوم"];
    const rows = state.tasks.map((task) => [
      safeCsv(task.title),
      safeCsv(task.description),
      task.dueDate || "",
      task.priority,
      task.status,
      task.tags.map((tag) => tag.label).join("|"),
    ]);
    const csvContent = [header, ...rows].map((row) => row.join(",")).join("\n");
    blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    filename = "tasks-export.csv";
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("تم إنشاء ملف التصدير");
}

function safeCsv(value) {
  if (!value) {
    return '""';
  }
  const text = value.replace(/"/g, '""');
  return `"${text}"`;
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  setTimeout(() => {
    refs.toast.classList.remove("show");
  }, 2600);
}

function startTimer() {
  if (isTimerRunning) {
    return;
  }
  isTimerRunning = true;
  saveState();
  timerInterval = setInterval(() => {
    if (state.preferences.timerSeconds <= 0) {
      pauseTimer();
      showToast("انتهت جلسة التركيز! أحسنت العمل.");
      state.preferences.timerSeconds = DEFAULT_TIMER_MINUTES * 60;
      updateTimerDisplay();
      saveState();
      return;
    }
    state.preferences.timerSeconds -= 1;
    updateTimerDisplay();
    saveState();
  }, 1000);
}

function pauseTimer() {
  if (!isTimerRunning) {
    return;
  }
  isTimerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  saveState();
}

function resetTimer() {
  pauseTimer();
  state.preferences.timerSeconds = DEFAULT_TIMER_MINUTES * 60;
  updateTimerDisplay();
  saveState();
}

function updateTimerDisplay() {
  const minutes = String(Math.floor(state.preferences.timerSeconds / 60)).padStart(2, "0");
  const seconds = String(state.preferences.timerSeconds % 60).padStart(2, "0");
  refs.timerDisplay.textContent = `${minutes}:${seconds}`;
}

function updateAnalytics() {
  if (!refs.statusChart || !refs.priorityChart || !refs.statusChart.dataset.ready) {
    return;
  }
  renderStatusChart();
  renderPriorityChart();
}

function renderStatusChart() {
  const ctx = refs.statusChart.getContext("2d");
  ctx.clearRect(0, 0, refs.statusChart.width, refs.statusChart.height);

  const counts = {
    todo: 0,
    "in-progress": 0,
    done: 0,
  };

  state.tasks.forEach((task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
  });

  const entries = Object.entries(counts);
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  let startAngle = -Math.PI / 2;
  const centerX = refs.statusChart.width / 2;
  const centerY = refs.statusChart.height / 2;
  const radius = Math.min(centerX, centerY) - 20;

  const colors = {
    todo: "#4c6ef5",
    "in-progress": "#00b4d8",
    done: "#20c997",
  };

  entries.forEach(([status, count]) => {
    const sliceAngle = (count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = colors[status];
    ctx.fill();
    startAngle += sliceAngle;
  });

  ctx.beginPath();
  ctx.fillStyle = colorWithAlpha(getComputedStyle(document.documentElement).getPropertyValue("--color-bg"), 0.92);
  ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-text");
  ctx.font = "600 16px Cairo, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("توزيع الحالات", centerX, centerY + 6);
}

function renderPriorityChart() {
  const ctx = refs.priorityChart.getContext("2d");
  ctx.clearRect(0, 0, refs.priorityChart.width, refs.priorityChart.height);

  const counts = {
    high: 0,
    medium: 0,
    low: 0,
  };

  state.tasks.forEach((task) => {
    counts[task.priority] = (counts[task.priority] || 0) + 1;
  });

  const barWidth = 60;
  const barGap = 40;
  const startX = 40;
  const baseY = refs.priorityChart.height - 40;
  const maxCount = Math.max(...Object.values(counts), 1);
  const scale = (refs.priorityChart.height - 120) / maxCount;

  const colors = {
    high: "#ff6b6b",
    medium: "#ffd43b",
    low: "#2ecc71",
  };

  Object.entries(counts).forEach(([priority, count], index) => {
    const height = count * scale;
    const x = startX + index * (barWidth + barGap);
    ctx.fillStyle = colors[priority];
    drawRoundedRect(ctx, x, baseY - height, barWidth, height, 16);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-text");
    ctx.font = "600 16px Cairo, sans-serif";
    ctx.fillText(priorityLabel(priority), x + barWidth / 2, baseY + 24);
    ctx.fillText(String(count), x + barWidth / 2, baseY - height - 12);
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
}

function priorityLabel(priority) {
  switch (priority) {
    case "high":
      return "مرتفعة";
    case "medium":
      return "متوسطة";
    default:
      return "منخفضة";
  }
}

function colorWithAlpha(rgbString, alpha) {
  const trimmed = rgbString.trim();
  if (trimmed.startsWith("#")) {
    const { r, g, b } = hexToRgb(trimmed);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = trimmed.replace(/[^\d,]/g, "").split(",");
  if (rgb.length >= 3) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }
  return `rgba(255,255,255,${alpha})`;
}

function hexToRgb(hex) {
  const sanitized = hex.replace("#", "");
  const value = sanitized.length === 3 ? sanitized.split("").map((c) => c + c).join("") : sanitized;
  const intVal = parseInt(value, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

function setupParallax() {
  const layers = document.querySelectorAll(".parallax-layer");
  window.addEventListener("pointermove", (event) => {
    const { innerWidth, innerHeight } = window;
    const x = (event.clientX - innerWidth / 2) / innerWidth;
    const y = (event.clientY - innerHeight / 2) / innerHeight;
    layers.forEach((layer, index) => {
      const depth = (index + 1) * 16;
      layer.style.transform = `translate3d(${x * depth}px, ${y * depth}px, 0)`;
    });
  });
}

function setupLazyAnalytics() {
  analyticsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          refs.statusChart.dataset.ready = "true";
          refs.priorityChart.dataset.ready = "true";
          updateAnalytics();
          analyticsObserver.disconnect();
        }
      });
    },
    { threshold: 0.25 }
  );
  analyticsObserver.observe(document.querySelector(".analytics"));
}
