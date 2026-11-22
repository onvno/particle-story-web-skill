import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { buildStories } from "./build-stories.mjs";

const scripts = await Promise.all(["story.js", "particles.js"].map(async (file) => ({
  file,
  source: await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8"),
})));
const stories = await buildStories({check: true});
const homePage = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const bootstrap = homePage.match(/<script>([\s\S]*?)<\/script>/);
assert(bootstrap && bootstrap.index < homePage.indexOf('<link rel="stylesheet"'));
const gap = 1066;

const target = (properties = {}) => Object.assign(new EventTarget(), properties);
const settle = () => new Promise((resolve) => setImmediate(resolve));

function recordWebGL() {
  let bound;
  const attributes = {};
  const uniforms = {};
  const gl = new Proxy({
    latest: null,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    isContextLost: () => false,
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    getUniformLocation: (_, name) => name,
    getAttribLocation: (_, name) => name,
    bindBuffer: (_, buffer) => { bound = buffer; },
    vertexAttribPointer: (name) => { attributes[name] = bound; },
    bufferData: (_, data) => { bound.data = data; },
    uniform1f: (name, value) => { uniforms[name] = value; },
    uniform4fv: (name, value) => { uniforms[name] = value; },
    drawArrays: (_, __, count) => {
      gl.latest = {
        progress: uniforms.uMix,
        ending: uniforms.uEnding,
        profile: uniforms.uFinaleProfile,
        force: uniforms.uForce,
        regions: uniforms["uFinaleRegions[0]"],
        motion: uniforms["uFinaleMotion[0]"],
        from: attributes.aFrom.data,
        to: attributes.aTo.data,
        seeds: attributes.aSeed.data,
        count,
      };
    },
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  return gl;
}

async function start(story, {small = false, reduced = false, webgl = true, loadRenderer = true, deferImages = false} = {}) {
  const gl = recordWebGL();
  const dataset = { ...story, endingLayers: JSON.stringify(story.endingLayers) };
  const root = target({ dataset, classList: {
    values: new Set(),
    add(name) { this.values.add(name); },
    remove(name) { this.values.delete(name); },
    toggle(name, enabled) { enabled ? this.add(name) : this.remove(name); },
  }});
  const style = { setProperty() {} };
  const chapters = story.chapters.map((chapter, index) => ({
    id: chapter.id,
    dataset: chapter,
    offsetTop: index * gap,
    style,
    toggleAttribute() {},
    scrollIntoView() { window.scrollY = this.offsetTop; },
  }));
  const links = chapters.map(() => ({ style, setAttribute() {}, removeAttribute() {} }));
  const picker = stories.length > 1 ? target({ querySelector: () => target() }) : null;
  const advance = { querySelector: () => ({}), setAttribute() {}, toggleAttribute() {} };
  const canvas = target({ clientWidth: small ? 390 : 1280, clientHeight: 720, getContext: () => webgl ? gl : null });
  const selectors = { "#particles":canvas, "#advance":advance, ".story-picker":picker };
  const media = target({ matches:reduced });
  const window = target({ scrollY:0, innerWidth:canvas.clientWidth, innerHeight:720, devicePixelRatio:1 });
  const document = target({
    documentElement: root,
    hidden: false,
    querySelector: (selector) => selectors[selector],
    querySelectorAll: (selector) => selector === ".chapters a" ? links : chapters,
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(384 * 384 * 4).fill(200) }),
      }),
    }),
  });

  const queue = new Map();
  const waitingImages = [];
  const warnings = [];
  let now = 0;
  let id = 0;
  let timeline;
  window.addEventListener("pangu:scroll", (event) => { timeline = event.detail; });
  const browser = {
    document, window, location:{}, console: { warn: (...args) => warnings.push(args) }, CustomEvent,
    Image: class {
      set src(_) {
        if (deferImages) waitingImages.push(this);
        else queueMicrotask(() => this.onload());
      }
    },
    matchMedia: (query) => query.includes("reduced-motion") ? media : { matches:small },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => { queue.set(++id, callback); return id; },
    cancelAnimationFrame: (frameId) => queue.delete(frameId),
  };
  function frame() {
    const calls = [...queue.values()];
    queue.clear();
    now += 16;
    calls.forEach((callback) => callback(now));
  }

  runInNewContext(bootstrap[1], browser, { filename:"particle-bootstrap" });
  const bootState = dataset.particles;
  for (const {file, source} of scripts) {
    if (loadRenderer || file !== "particles.js") runInNewContext(source, browser, { filename:file });
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await settle();
  frame();

  return {
    scroll(position) {
      window.scrollY = position * gap;
      window.dispatchEvent(new Event("scroll"));
      frame();
      frame();
      return { timeline, gpu:gl.latest };
    },
    classes: root.classList.values,
    bootState,
    particleState: () => dataset.particles,
    draw: () => gl.latest,
    frame,
    async loadImages(count = waitingImages.length) {
      waitingImages.splice(0, count).forEach((image) => image.onload());
      await settle();
    },
    async failImage() {
      waitingImages.shift().onerror();
      await settle();
    },
    setHidden(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    warnings,
    advance,
  };
}

for (const [index, story] of stories.entries()) {
  const small = index % 2 === 1;
  const browser = await start(story, {small});
  assert.equal(browser.particleState(), "ready", story.title);
  const last = story.chapters.length - 1;
  const positions = Array.from({length:4 * last + 1}, (_, i) => i / 4);
  const forward = positions.map((position) => browser.scroll(position));
  const reverse = positions.slice().reverse().map((position) => browser.scroll(position)).reverse();
  forward.forEach(({timeline, gpu}, i) => {
    assert.deepEqual(timeline, reverse[i].timeline);
    for (const key of ["progress", "ending", "from", "to", "seeds"]) assert.equal(gpu[key], reverse[i].gpu[key]);
    assert.equal(gpu.seeds, forward[0].gpu.seeds);
    assert.equal(gpu.count, small ? 42000 : 89800);
  });
  for (let chapter = 1; chapter < last; chapter++) {
    const previous = browser.scroll(chapter - 0.2);
    const arriving = browser.scroll(chapter);
    assert.equal(previous.gpu.to, arriving.gpu.from);
    assert.equal(previous.gpu.force, story.chapters[chapter].force ?? 0.96);
  }
  const beforeEnd = browser.scroll(last - 0.12).gpu;
  const ending = browser.scroll(last).gpu;
  assert.equal(beforeEnd.progress, 1);
  assert.equal(beforeEnd.ending, 0);
  assert.equal(ending.ending, story.finale === "still" ? 0 : 1);
  assert.equal(ending.profile, {still:0, river:1, clouds:2, tide:3, custom:4}[story.finale]);
  if (story.finale === "custom") {
    const size = story.endingLayers.length * 4;
    const regions = new Float32Array(story.endingLayers.flatMap(({ region }) => region));
    const motion = new Float32Array(story.endingLayers.flatMap(({ move, speed, pulse }) => [...move, speed, pulse]));
    assert.deepEqual([...ending.regions.slice(0, size)], [...regions]);
    assert.deepEqual([...ending.motion.slice(0, size)], [...motion]);
  }
  assert.equal(browser.advance.href, "#" + story.chapters[0].id);
  assert.equal(browser.scroll(last - 0.12).gpu.ending, 0);
  console.log(`PASS ${story.title} · shared particles, reversible scroll, transition continuity and ${story.finale} finale`);
}

const reduced = await start(stories[0], {reduced:true});
const noWebGL = await start(stories[0], {webgl:false});
assert.equal(reduced.scroll(stories[0].chapters.length - 1).timeline.ending, 0);
assert(!reduced.classes.has("motion"));
assert.equal(reduced.bootState, undefined);
assert.equal(reduced.particleState(), "static");
assert.equal(noWebGL.particleState(), "static");
const missingRenderer = await start(stories[0], {loadRenderer:false});
assert.equal(missingRenderer.bootState, "boot");
assert.equal(missingRenderer.particleState(), "static");

const deferred = await start(stories[0], {deferImages:true});
assert.equal(deferred.bootState, "boot");
assert.equal(deferred.particleState(), "loading");
assert.equal(deferred.draw(), null);
await deferred.loadImages(stories[0].chapters.length - 1);
deferred.frame();
assert.equal(deferred.particleState(), "loading");
assert.equal(deferred.draw(), null);
await deferred.loadImages();
assert.equal(deferred.particleState(), "loading");
deferred.frame();
assert(deferred.draw());
assert.equal(deferred.particleState(), "ready");
deferred.setHidden(true);
assert.equal(deferred.particleState(), "ready");
deferred.setHidden(false);
assert.equal(deferred.particleState(), "ready");
deferred.frame();
assert.equal(deferred.particleState(), "ready");

const broken = await start(stories[0], {deferImages:true});
await broken.failImage();
assert.equal(broken.particleState(), "static");
assert.equal(broken.warnings.length, 1);
assert.equal(broken.draw(), null);
console.log("PASS loader waits for all art and the first frame, stays ready across tab switches, and releases on fallback");
