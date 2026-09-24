// ============================================================
//  reveal.js — плавное появление секций при прокрутке
//  Вешаем на элементы с атрибутом data-reveal.
//  Динамические карточки (услуги, записи) анимируются чистым CSS
//  прямо в стилях .card / .item-row / .review — сюда их добавлять не нужно.
// ============================================================
export function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach(el => el.classList.add("in-view"));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

  items.forEach((el, i) => {
    el.classList.add("reveal-ready");
    el.style.setProperty("--reveal-delay", `${Math.min(i, 6) * 70}ms`);
    io.observe(el);
  });
}
