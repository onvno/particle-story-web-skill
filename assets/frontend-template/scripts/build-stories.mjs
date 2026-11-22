import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
const source = join(project, "stories");
const dist = join(project, "dist");
const token = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const themes = ["earth", "sky", "sea"];
const finales = ["still", "river", "clouds", "tide", "custom"];
const pigments = ["bronze", "celadon", "original"];
const numerals = "一二三四五六七八九十";
const htmlEscape = (text) => String(text).replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
));
const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const validNumber = (value, min, max) => value === undefined || inRange(value, min, max);

function validateStory(story, file) {
  const verify = (pass, message) => {
    if (!pass) throw new Error(`${file}: ${message}`);
  };
  verify(story.slug === "" || typeof story.slug === "string" && token.test(story.slug), "slug must be empty or kebab-case");
  verify([story.title, story.seal, story.description].every(hasText), "title, seal and description are required");
  verify(themes.includes(story.theme), `theme must be one of ${themes.join(", ")}`);
  verify(finales.includes(story.finale), `finale must be one of ${finales.join(", ")}`);
  if (story.finale === "custom") {
    const layers = story.endingLayers;
    verify(Array.isArray(layers) && layers.length >= 1 && layers.length <= 3, "custom finale needs 1–3 endingLayers");
    layers.forEach((layer, index) => {
      const { region, move, speed, pulse } = layer ?? {};
      verify(Array.isArray(region) && region.length === 4 && region.slice(0, 2).every((v) => inRange(v, 0, 1))
        && region.slice(2).every((v) => inRange(v, 0.02, 1)), `invalid region for ending layer ${index + 1}`);
      verify(Array.isArray(move) && move.length === 2 && move.every((v) => inRange(v, -0.25, 0.25)),
        `invalid movement for ending layer ${index + 1}`);
      verify(inRange(speed, 0.1, 4) && inRange(pulse, 0, 0.8), `invalid timing or pulse for ending layer ${index + 1}`);
      verify(pulse > 0 || move.some((v) => v !== 0), `ending layer ${index + 1} needs movement or a brightness pulse`);
    });
  }
  verify(Array.isArray(story.chapters) && story.chapters.length >= 2 && story.chapters.length <= numerals.length, "use 2–10 chapters");
  const ids = new Set();
  for (const chapter of story.chapters) {
    const { id, art, short, label, text, title, pigment } = chapter;
    verify(typeof id === "string" && token.test(id) && !ids.has(id), `invalid or duplicate chapter id '${id}'`);
    ids.add(id);
    verify(typeof art === "string" && token.test(art), `invalid art filename for '${id}'`);
    verify([short, label].every(hasText), `chapter '${id}' needs navigation and full labels`);
    verify(Array.isArray(title) && title.length === 2 && title.every(hasText), `chapter '${id}' needs two title lines`);
    verify(Array.isArray(text) && text.length > 0 && text.every(hasText), `chapter '${id}' needs story text`);
    verify(pigment === undefined || pigments.includes(pigment), `invalid pigment for '${id}'`);
    verify(validNumber(chapter.height, 0.5, 1.2) && validNumber(chapter.feather, 0.01, 0.35)
      && validNumber(chapter.force, 0, 2), `check height, feather and force for '${id}'`);
  }
}

async function readStories() {
  const files = (await readdir(source)).filter((file) => file.endsWith(".json")).sort();
  const stories = await Promise.all(files.map(async (file) => {
    const story = JSON.parse(await readFile(join(source, file), "utf8"));
    validateStory(story, file);
    await Promise.all(story.chapters.map(async (chapter) => {
      try {
        await access(join(dist, "art", chapter.art + ".webp"));
      } catch {
        throw new Error(`${file}: missing art/${chapter.art}.webp for '${chapter.id}'`);
      }
    }));
    return story;
  }));
  const slugs = stories.map((story) => story.slug);
  if (!slugs.includes("") || new Set(slugs).size !== slugs.length) {
    throw new Error("Use exactly one empty slug for the home story and a unique slug for each other story.");
  }
  return stories;
}

function render(story, stories) {
  const { chapters } = story;
  const assets = story.slug ? "../" : "./";
  const artUrl = (chapter) => assets + "art/" + chapter.art + ".webp";
  const storyUrl = (other) => assets + (other.slug ? other.slug + "/" : "");
  const section = (chapter, index) => {
    const heading = index === 0 ? "h1" : "h2";
    const attributes = [
      ["art", artUrl(chapter)],
      ["pigment", chapter.pigment],
      ["height", chapter.height],
      ["feather", chapter.feather],
      ["force", chapter.force],
    ].filter(([, value]) => value !== undefined)
      .map(([name, value]) => `data-${name}="${htmlEscape(value)}"`).join(" ");
    return `    <section class="chapter" id="${chapter.id}" ${attributes}>
      <div class="chapter-art" style="--art: url('${artUrl(chapter)}')" aria-hidden="true"></div>
      <div class="chapter-copy">
        <p class="act">第${numerals[index]}幕 <span></span> ${htmlEscape(chapter.label)}</p>
        <${heading}>${htmlEscape(chapter.title[0])}<span>${htmlEscape(chapter.title[1])}</span></${heading}>
        <p class="narration">${chapter.text.map(htmlEscape).join("<br>")}</p>
      </div>
    </section>`;
  };
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="3" y="3" width="42" height="42" rx="4" fill="#943b28"/><text x="24" y="34" text-anchor="middle" fill="#f7e4bd" font-size="29" font-family="serif">${htmlEscape(story.seal)}</text></svg>`;
  const customLayers = story.finale === "custom"
    ? ` data-ending-layers="${htmlEscape(JSON.stringify(story.endingLayers))}"`
    : "";
  const picker = stories.length > 1 ? `
    <details class="story-picker">
      <summary>神话选集</summary>
      <nav aria-label="神话选集">
${stories.map((other) => `        <a href="${other === story ? "#" + chapters[0].id : storyUrl(other)}"${other === story ? ' aria-current="page"' : ""}>${htmlEscape(other.title)}</a>`).join("\n")}
      </nav>
    </details>` : "";

  return `<!doctype html>
<!-- Generated by scripts/build-stories.mjs -->
<html lang="zh-CN" data-theme="${story.theme}" data-finale="${story.finale}"${customLayers}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="${{earth:"#100d0a",sky:"#0c1318",sea:"#0a1118"}[story.theme]}">
  <meta name="description" content="${htmlEscape(story.description)}">
  <title>${htmlEscape(story.title)} · 华夏神话</title>
  <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}">
  <script>
    (() => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const root = document.documentElement;
      root.dataset.particles = "boot";
      document.addEventListener("DOMContentLoaded", () => {
        if (root.dataset.particles === "boot") root.dataset.particles = "static";
      }, { once: true });
    })();
  </script>
  <link rel="stylesheet" href="${assets}style.css">
  <link rel="preload" href="${artUrl(chapters[0])}" as="image">
  <script src="${assets}story.js" defer></script>
  <script src="${assets}particles.js" defer></script>
</head>
<body>
  <div class="world" aria-hidden="true"><canvas id="particles"></canvas></div>
  <div class="particle-loader" role="status">
    <span class="particle-loader-orbit" aria-hidden="true"></span>
    <span>粒子正在聚拢</span>
  </div>

  <header class="masthead">
    <a class="brand" href="#${chapters[0].id}" aria-label="华夏神话，返回故事开头">
      <span class="seal" aria-hidden="true">${htmlEscape(story.seal)}</span>
      <span>华夏神话</span>
    </a>${picker}
  </header>

  <main class="story" aria-label="${htmlEscape(story.title)}">
${chapters.map(section).join("\n\n")}
  </main>

  <footer class="story-controls">
    <nav class="chapters" aria-label="故事章节" style="--chapter-count: ${chapters.length}">
${chapters.map(({id,short},index) => `      <a href="#${id}"${index === 0 ? ' aria-current="step"' : ""}><span class="chapter-bar"></span><span class="chapter-name">${htmlEscape(short)}</span></a>`).join("\n")}
    </nav>
    <a id="advance" class="advance" href="#${chapters[1].id}">
      <span class="advance-label">向下滚动</span><span class="advance-icon" aria-hidden="true"></span>
    </a>
  </footer>
</body>
</html>
`;
}

export async function buildStories({check = false} = {}) {
  const stories = await readStories();
  await Promise.all(stories.map(async (story) => {
    const directory = join(dist, story.slug);
    const path = join(directory, "index.html");
    const page = render(story, stories);
    if (check) {
      const current = await readFile(path, "utf8").catch(() => "");
      if (current !== page) throw new Error(`Regenerate ${path} with node scripts/build-stories.mjs`);
      return;
    }
    await mkdir(directory, {recursive: true});
    await writeFile(path, page);
  }));
  return stories;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const stories = await buildStories({check});
  console.log(`${check ? "Verified" : "Built"} ${stories.length} stories and ${stories.reduce((count, story) => count + story.chapters.length, 0)} chapters.`);
}
