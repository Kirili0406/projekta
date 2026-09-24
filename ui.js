// ============================================================
//  ui.js — общие вспомогательные функции интерфейса
// ============================================================

export function toast(message, type = "info") {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}
export function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

export function fmtPrice(n) {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

export function fmtDate(d) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function starString(rating) {
  const r = Math.round(rating || 0);
  return "★".repeat(r) + "☆".repeat(5 - r);
}

export function statusLabel(status) {
  return {
    draft: "В корзине",
    confirmed: "Подтверждено",
    in_progress: "В работе",
    done: "Завершено",
    cancelled: "Отменено"
  }[status] || status;
}

// Подсвечивает текущий пункт меню по имени файла страницы
export function markActiveNav() {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(a => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
}

// Простая защита от XSS при вставке пользовательского текста
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Дебаунс для строки поиска
export function debounce(fn, delay = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Токенизация текста в массив ключевых слов для array-contains поиска
export function buildKeywords(...parts) {
  const text = parts.join(" ").toLowerCase();
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
  return [...new Set(words)];
}
