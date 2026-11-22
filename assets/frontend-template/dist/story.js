(() => {
  const root = document.documentElement;
  const chapters = [...document.querySelectorAll(".chapter")];
  const links = [...document.querySelectorAll(".chapters a")];
  const advance = document.querySelector("#advance");
  const advanceLabel = advance.querySelector(".advance-label");
  const picker = document.querySelector(".story-picker");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const lastIndex = chapters.length - 1;
  let activeIndex = -1;
  let offsets = [];
  let frame = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function smoothstep(from, to, value) {
    const step = clamp((value - from) / (to - from), 0, 1);
    return step * step * (3 - 2 * step);
  }

  function updateChapter(index) {
    if (index === activeIndex) return;
    links[activeIndex]?.removeAttribute("aria-current");
    links[index].setAttribute("aria-current", "step");
    activeIndex = index;

    const atEnd = index === lastIndex;
    advance.href = "#" + chapters[atEnd ? 0 : index + 1].id;
    advanceLabel.textContent = atEnd ? "重读故事" : "向下滚动";
    advance.setAttribute("aria-label", atEnd ? "重读故事" : "阅读下一幕");
    advance.toggleAttribute("data-end", atEnd);
  }

  function updateScroll() {
    frame = 0;
    const scroll = window.scrollY;
    let from = offsets.findLastIndex((offset) => offset <= scroll + 0.5);
    from = clamp(from, 0, lastIndex - 1);
    const fraction = clamp((scroll - offsets[from]) / (offsets[from + 1] - offsets[from]), 0, 1);
    const progress = from + fraction;

    updateChapter(Math.round(progress));
    chapters.forEach((chapter, index) => {
      const distance = index - progress;
      const opacity = 1 - smoothstep(0.16, 0.49, Math.abs(distance));
      chapter.style.setProperty("--copy-opacity", opacity.toFixed(3));
      chapter.style.setProperty("--art-opacity", (1 - smoothstep(0, 0.95, Math.abs(distance))).toFixed(3));
      chapter.style.setProperty("--copy-shift", `${clamp(distance * 42, -22, 22).toFixed(1)}px`);
      chapter.toggleAttribute("data-visible", opacity > 0);
      links[index].style.setProperty("--completion", clamp(progress - index, 0, 1));
    });

    const morph = reducedMotion.matches ? 0 : smoothstep(0.13, 0.87, fraction);
    const ending = reducedMotion.matches ? 0 : smoothstep(lastIndex - 0.11, lastIndex - 0.002, progress);
    window.dispatchEvent(new CustomEvent("pangu:scroll", {
      detail: { progress: from + morph, ending },
    }));
  }

  function measure() {
    offsets = chapters.map((chapter) => chapter.offsetTop);
    if (!frame) frame = requestAnimationFrame(updateScroll);
  }

  function setMotion() {
    const current = activeIndex;
    root.classList.toggle("motion", !reducedMotion.matches);
    if (current >= 0) chapters[current].scrollIntoView({ behavior: "instant" });
    measure();
  }

  window.addEventListener("scroll", () => {
    if (!frame) frame = requestAnimationFrame(updateScroll);
  }, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("pageshow", measure);
  if (picker) {
    picker.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !picker.open) return;
      picker.open = false;
      picker.querySelector("summary").focus();
    });
    picker.querySelector("nav").addEventListener("click", (event) => {
      if (event.target.closest("a")) picker.open = false;
    });
    document.addEventListener("pointerdown", (event) => {
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    }, { passive: true });
  }
  reducedMotion.addEventListener("change", setMotion);
  setMotion();

  // The parser can resolve an initial hash before the motion layout takes effect.
  const initialChapter = chapters.find((chapter) => "#" + chapter.id === location.hash);
  if (initialChapter) initialChapter.scrollIntoView({ behavior: "instant" });
})();
