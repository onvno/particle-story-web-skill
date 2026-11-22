(() => {
  const root = document.documentElement;
  const canvas = document.querySelector("#particles");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const chapters = [...document.querySelectorAll("[data-art]")].map(({ dataset }) => ({
    url: dataset.art,
    pigment: dataset.pigment ?? "bronze",
    height: Number(dataset.height ?? 1),
    feather: Number(dataset.feather ?? 0.1),
    force: Number(dataset.force ?? 0.96),
  }));
  const finaleProfile = { still: 0, river: 1, clouds: 2, tide: 3, custom: 4 }[root.dataset.finale] ?? 0;
  const finaleLayers = finaleProfile === 4 ? JSON.parse(root.dataset.endingLayers) : [];
  const dustColor = {
    earth: [1, 0.69, 0.34],
    sky: [0.67, 0.89, 0.81],
    sea: [0.52, 0.73, 0.94],
  }[root.dataset.theme] ?? [1, 0.69, 0.34];
  const smallScreen = matchMedia("(max-width: 720px)");
  const artCount = smallScreen.matches ? 39000 : 82000;
  const dustCount = smallScreen.matches ? 3000 : 7800;
  const total = artCount + dustCount;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const vertexSource = `
    attribute vec4 aFrom;
    attribute vec4 aTo;
    attribute vec3 aFromColor;
    attribute vec3 aToColor;
    attribute vec4 aSeed;

    uniform vec2 uResolution;
    uniform vec2 uOrigin;
    uniform vec2 uPointer;
    uniform float uScale;
    uniform float uDpr;
    uniform float uTime;
    uniform float uMix;
    uniform float uForce;
    uniform float uEnding;
    uniform float uFinaleProfile;
    uniform float uFinaleHeight;
    uniform vec3 uDustColor;
    uniform vec4 uFinaleRegions[3];
    uniform vec4 uFinaleMotion[3];

    varying vec3 vColor;
    varying float vEnergy;
    varying float vHalo;

    // Trace the river through the bends in the final illustration, in source image coordinates.
    float riverCenter(float y) {
      return 0.49
        + 0.17 * smoothstep(0.56, 0.623, y)
        - 0.15 * smoothstep(0.623, 0.675, y)
        + 0.22 * smoothstep(0.675, 0.722, y)
        - 0.25 * smoothstep(0.722, 0.792, y)
        + 0.29 * smoothstep(0.792, 0.888, y);
    }

    void animateRiver(vec2 uv, inout vec2 p, float light, vec3 color, inout float energy) {
      float y = uv.y;
      float center = riverCenter(y);
      float width = mix(0.075, 0.28, smoothstep(0.63, 0.93, y));
      float river = 1.0 - smoothstep(0.28, 1.0, abs(uv.x - center) / width);
      river *= smoothstep(0.55, 0.62, y) * (1.0 - smoothstep(0.92, 0.99, y));
      river *= smoothstep(0.20, 0.61, light);
      float travel = fract(uTime * 0.20 + aSeed.z);
      float downstream = 0.047 * travel * sin(travel * 3.14159265);
      vec2 current = vec2((riverCenter(y + downstream) - center) * 2.0, downstream * 2.0 * uFinaleHeight);
      float glint = 0.5 + 0.5 * sin((y - uTime * 0.058) * 77.0 + (uv.x - center) * 12.0);

      float wisp = 0.5 + 0.5 * sin(y * 63.0 + sin(uv.x * 8.0) * 1.65);
      float mist = smoothstep(0.15, 0.28, y) * (1.0 - smoothstep(0.53, 0.69, y));
      mist *= smoothstep(0.28, 0.66, light) * smoothstep(0.45, 0.83, color.b / max(color.r, 0.01));
      mist *= (0.30 + 0.70 * wisp * wisp) * (1.0 - river);
      float wind = uTime * 0.63 + uv.x * 5.0 + y * 14.0;
      vec2 cloud = vec2(0.105 * sin(wind), 0.023 * cos(wind * 0.8 + aSeed.x));

      p += uEnding * (river * current + mist * cloud);
      energy *= 1.0 + uEnding * (river * glint * glint * 0.66 + mist * 0.23 * sin(wind));
    }

    void animateClouds(vec2 uv, inout vec2 p, float light, inout float energy) {
      float arch = 0.275 + (uv.x - 0.62) * (uv.x - 0.62) * 0.24;
      float ribbon = 1.0 - smoothstep(0.012, 0.11, abs(uv.y - arch));
      float air = smoothstep(0.11, 0.22, uv.y) * (1.0 - smoothstep(0.49, 0.64, uv.y));
      float cloud = air * smoothstep(0.26, 0.69, light);
      float breeze = uTime * 0.68 + uv.y * 19.0 + uv.x * 6.0;
      vec2 sway = vec2(0.085 * sin(breeze), 0.022 * cos(breeze * 0.85 + aSeed.x));
      float glow = 0.5 + 0.5 * sin(uv.x * 14.0 - uTime * 1.1 + uv.y * 6.0);
      p += uEnding * cloud * sway * (1.0 - ribbon * 0.65);
      energy *= 1.0 + uEnding * (ribbon * glow * glow * 0.61 + cloud * 0.22 * sin(breeze));
    }

    void animateTide(vec2 uv, inout vec2 p, float light, vec3 color, inout float energy) {
      float water = smoothstep(0.31, 0.48, uv.y) * (1.0 - smoothstep(0.92, 1.0, uv.y));
      float foam = smoothstep(0.23, 0.72, light) * smoothstep(0.6, 1.0, color.b / max(color.r, 0.01));
      float wave = uv.y * 33.0 + uv.x * 5.0 - uTime * 1.48;
      float crest = 0.5 + 0.5 * sin(wave);
      vec2 swell = vec2(0.058 * cos(wave), 0.040 * sin(wave)) * (0.48 + foam * 0.52);
      p += uEnding * water * swell;
      energy *= 1.0 + uEnding * water * foam * (crest * crest * 0.53 - 0.09);
    }

    void animateRegions(vec2 uv, inout vec2 p, inout float energy) {
      float glow = 0.0;
      for (int i = 0; i < 3; i++) {
        vec4 region = uFinaleRegions[i];
        vec4 motion = uFinaleMotion[i];
        if (region.z > 0.0 && region.w > 0.0) {
          float radius = length((uv - region.xy) / region.zw);
          float weight = 1.0 - smoothstep(0.25, 1.0, radius);
          float wave = sin(uTime * motion.z - dot(uv - region.xy, vec2(9.0, 13.0)));
          vec2 shift = motion.xy * vec2(2.0, 2.0 * uFinaleHeight);
          p += uEnding * weight * wave * shift;
          glow += weight * wave * motion.w;
        }
      }
      energy *= 1.0 + uEnding * clamp(glow, -0.65, 0.9);
    }

    void main() {
      float phase = aSeed.z * 6.283185;
      // Both ends must land on the same pose regardless of scroll direction.
      float motion = 4.0 * uMix * (1.0 - uMix);
      float drift = uTime * (0.13 + aSeed.x * 0.19);
      float twinkle = 0.83 + 0.17 * sin(drift * 5.0 + phase);
      vec4 target = mix(aFrom, aTo, uMix);
      vec2 p = target.xy;

      if (aSeed.w < 0.0) {
        p += vec2(sin(drift + phase) * 0.016, cos(drift + phase) * 0.009);
        p *= uResolution * 0.5;
        p += uResolution * 0.5 + uPointer * (aSeed.x * 9.0);
        gl_PointSize = uDpr * (0.66 + aSeed.x * aSeed.x * 1.2);
        vColor = mix(uDustColor * vec3(0.58, 0.42, 0.33), uDustColor, aSeed.y);
        vEnergy = twinkle * target.w * (1.0 + motion * 0.55);
        vHalo = 0.08;
      } else {
        float angle = motion * (0.16 + aSeed.x * 0.42) * uForce;
        float turn = angle * (0.7 + length(p) * 0.35);
        float c = cos(turn);
        float s = sin(turn);
        p = mat2(c, s, -s, c) * p;
        vec2 flow = vec2(cos(phase + angle * 2.0), sin(phase + angle * 2.0));
        p += flow * motion * (0.055 + aSeed.y * aSeed.y * 0.77) * uForce;

        gl_PointSize = uDpr * (0.96 + pow(aSeed.w, 3.1) * 1.65 + target.w * 0.42);
        vColor = mix(aFromColor, aToColor, uMix);
        vEnergy = twinkle * (0.36 + target.w * 0.66) * (1.0 - motion * 0.22);
        vHalo = 0.12 + target.z * 0.15 + motion * 0.1;
        if (uEnding > 0.0) {
          vec2 uv = vec2(p.x, p.y / uFinaleHeight) * 0.5 + 0.5;
          if (uFinaleProfile < 1.5) animateRiver(uv, p, target.w, vColor, vEnergy);
          else if (uFinaleProfile < 2.5) animateClouds(uv, p, target.w, vEnergy);
          else if (uFinaleProfile < 3.5) animateTide(uv, p, target.w, vColor, vEnergy);
          else animateRegions(uv, p, vEnergy);
        }
        p = uOrigin + p * uScale;
      }
      gl_Position = vec4(p.x / uResolution.x * 2.0 - 1.0,
                         1.0 - p.y / uResolution.y * 2.0, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    varying float vEnergy;
    varying float vHalo;

    void main() {
      vec2 point = gl_PointCoord * 2.0 - 1.0;
      float radius = dot(point, point);
      float core = exp(-radius * 4.0);
      float halo = exp(-radius * 1.7) * vHalo;
      float falloff = 1.0 - smoothstep(0.63, 1.0, radius);
      gl_FragColor = vec4(vColor * (core + halo) * falloff * vEnergy, 1.0);
    }
  `;

  function randomFor(seed) {
    return () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function readPixels(image) {
    const size = 384;
    const surface = document.createElement("canvas");
    surface.width = surface.height = size;
    const context = surface.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    return { pixels: context.getImageData(0, 0, size, size).data, size };
  }

  // Interleaving x and y bits gives each point a location along the same 2D curve.
  function spatialOrder(x, y) {
    let order = 0;
    for (let bit = 0; bit < 10; bit++) {
      order |= ((x >> bit) & 1) << (bit * 2);
      order |= ((y >> bit) & 1) << (bit * 2 + 1);
    }
    return order;
  }

  function sampleScene(image, chapter, dust) {
    const { pixels, size } = readPixels(image);
    const weights = new Float64Array(size * size);
    const lumas = new Float32Array(weights.length);
    const rand = randomFor(3189 + chapter * 101);
    const { height, feather, pigment } = chapters[chapter];
    let sum = 0;

    for (let i = 0; i < weights.length; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      const border = Math.min(x, y, size - x - 1, size - y - 1);
      const edgeWeight = clamp(border / (size * feather), 0, 1);
      const luma = (pixels[i * 4] * 0.2126 + pixels[i * 4 + 1] * 0.7152 + pixels[i * 4 + 2] * 0.0722) / 255;
      lumas[i] = luma;
      sum += Math.pow(Math.max(0, luma - 0.025), 1.16) * edgeWeight * edgeWeight;
      weights[i] = sum;
    }
    if (sum === 0) throw new Error(`No illuminated pixels in ${chapters[chapter].url}`);

    const samples = [];
    let pixel = 0;
    for (let i = 0; i < artCount; i++) {
      const weight = (i + rand()) / artCount * sum;
      while (weights[pixel] < weight) pixel++;
      const x = (pixel % size + rand()) / size;
      const y = (Math.floor(pixel / size) + rand()) / size;
      samples.push({ x, y, pixel, key: spatialOrder(Math.floor(x * 1024), Math.floor(y * 1024)) });
    }
    samples.sort((a, b) => a.key - b.key);

    const positions = new Float32Array(total * 4);
    const colors = new Float32Array(total * 3);
    const bronze = [1, 0.65, 0.32];
    const celadon = [0.45, 0.9, 0.82];
    const tintWeight = pigment === "original" ? 0.04 : 0.24;

    samples.forEach(({ x, y, pixel }, i) => {
      const index = pixel * 4;
      const max = Math.max(pixels[index], pixels[index + 1], pixels[index + 2], 1);
      const cool = pigment === "celadon" && pixels[index + 1] > pixels[index] * 0.89
        && pixels[index + 2] > pixels[index] * 0.67;
      const tint = cool ? celadon : bronze;
      positions[i * 4] = x * 2 - 1;
      positions[i * 4 + 1] = (y * 2 - 1) * height;
      positions[i * 4 + 2] = rand();
      positions[i * 4 + 3] = lumas[pixel];
      for (let c = 0; c < 3; c++) {
        colors[i * 3 + c] = (pixels[index + c] / max) * (1 - tintWeight) + tint[c] * tintWeight;
      }
    });
    positions.set(dust, artCount * 4);
    return { positions, colors };
  }

  function makeDust() {
    const rand = randomFor(89142);
    const dust = new Float32Array(dustCount * 4);
    for (let i = 0; i < dustCount; i++) {
      const x = rand() * 2 - 1;
      const y = rand() * 2 - 1;
      const density = 0.50 + 0.50 * Math.exp(-Math.abs(y - 0.26 * x) * 2.8);
      dust.set([x, y, 0, (0.045 + Math.pow(rand(), 8) * 0.34) * density], i * 4);
    }
    return dust;
  }

  function makeSeeds() {
    const rand = randomFor(8972);
    const seeds = new Float32Array(total * 4);
    for (let i = 0; i < total; i++) {
      seeds.set([rand(), rand(), rand(), i < artCount ? rand() : -1], i * 4);
    }
    return seeds;
  }

  function loadImage({ url }) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load particle art: ${url}`));
      image.src = url;
    });
  }

  function makeProgram(gl) {
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function makeRenderer(gl, scenes) {
    const program = makeProgram(gl);
    gl.useProgram(program);

    function createAttribute(name, size) {
      const location = gl.getAttribLocation(program, name);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      return buffer;
    }
    function update(buffer, data, usage = gl.DYNAMIC_DRAW) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    }

    const fromPositions = createAttribute("aFrom", 4);
    const toPositions = createAttribute("aTo", 4);
    const fromColors = createAttribute("aFromColor", 3);
    const toColors = createAttribute("aToColor", 3);
    const seeds = createAttribute("aSeed", 4);
    update(seeds, makeSeeds(), gl.STATIC_DRAW);
    const uniforms = Object.fromEntries(
      ["Resolution", "Origin", "Pointer", "Scale", "Dpr", "Time", "Mix", "Force", "Ending",
        "FinaleProfile", "FinaleHeight", "DustColor"]
        .map((name) => [name, gl.getUniformLocation(program, "u" + name)])
    );
    gl.uniform1f(uniforms.FinaleProfile, finaleProfile);
    gl.uniform1f(uniforms.FinaleHeight, chapters.at(-1).height);
    gl.uniform3fv(uniforms.DustColor, dustColor);
    if (finaleProfile === 4) {
      const regions = new Float32Array(12);
      const motion = new Float32Array(12);
      finaleLayers.forEach(({ region, move, speed, pulse }, index) => {
        regions.set(region, index * 4);
        motion.set([...move, speed, pulse], index * 4);
      });
      gl.uniform4fv(gl.getUniformLocation(program, "uFinaleRegions[0]"), regions);
      gl.uniform4fv(gl.getUniformLocation(program, "uFinaleMotion[0]"), motion);
    }

    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    let pair = -1;

    return (scroll, time, pointer) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio, smallScreen.matches ? 1.6 : 1.9,
        Math.sqrt(4_500_000 / (width * height)));
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        gl.viewport(0, 0, pixelWidth, pixelHeight);
      }

      const index = Math.min(Math.floor(scroll.progress), scenes.length - 2);
      const mix = scroll.progress - index;
      if (index !== pair) {
        const from = scenes[index];
        const to = scenes[index + 1];
        update(fromPositions, from.positions);
        update(toPositions, to.positions);
        update(fromColors, from.colors);
        update(toColors, to.colors);
        pair = index;
      }
      const mobile = smallScreen.matches;
      const compact = height <= 610;
      const stageSize = mobile ? Math.min(width * 1.05, height * (compact ? 0.48 : 0.52))
        : Math.min(width * 0.64, height * 0.94);
      const originX = width * (mobile ? 0.51 : 0.672);
      const originY = height * (mobile ? (compact ? 0.283 : 0.305) : 0.493);
      gl.uniform2f(uniforms.Resolution, pixelWidth, pixelHeight);
      gl.uniform2f(uniforms.Origin, originX * dpr, originY * dpr);
      gl.uniform2f(uniforms.Pointer, pointer.x * dpr, pointer.y * dpr);
      gl.uniform1f(uniforms.Scale, stageSize * 0.5 * dpr);
      gl.uniform1f(uniforms.Dpr, dpr);
      gl.uniform1f(uniforms.Time, time);
      gl.uniform1f(uniforms.Mix, mix);
      gl.uniform1f(uniforms.Force, chapters[index + 1].force);
      gl.uniform1f(uniforms.Ending, finaleProfile ? scroll.ending : 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, total);
      return !gl.isContextLost();
    };
  }

  const pointer = { x: 0, y: 0 };
  const easedPointer = { x: 0, y: 0 };
  let scenes;
  let render;
  let starting = false;
  let frame = 0;
  let scroll = { progress: 0, ending: 0 };
  let previousTime = 0;

  function tick(now) {
    const elapsed = Math.min(now - (previousTime || now), 40);
    previousTime = now;
    const ease = 1 - Math.exp(-elapsed / 75);
    easedPointer.x += (pointer.x - easedPointer.x) * ease;
    easedPointer.y += (pointer.y - easedPointer.y) * ease;
    try {
      if (render(scroll, now * 0.001, easedPointer) && root.dataset.particles !== "ready") {
        root.dataset.particles = "ready";
      }
      frame = requestAnimationFrame(tick);
    } catch (error) {
      showStatic(error);
    }
  }

  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }

  function showStatic(error) {
    pause();
    root.dataset.particles = "static";
    if (error) console.warn("Particle rendering is unavailable. Showing the illustrated story.", error);
  }

  async function start() {
    if (starting || reducedMotion.matches || document.hidden || frame) return;
    starting = true;
    try {
      const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false });
      if (!gl || gl.isContextLost()) {
        showStatic();
        return;
      }
      if (!scenes) {
        const dust = makeDust();
        scenes = (await Promise.all(chapters.map(loadImage))).map((image, index) => sampleScene(image, index, dust));
      }
      if (reducedMotion.matches || document.hidden) return;
      if (gl.isContextLost()) {
        showStatic();
        return;
      }
      render ??= makeRenderer(gl, scenes);
      frame = requestAnimationFrame(tick);
    } catch (error) {
      showStatic(error);
    } finally {
      starting = false;
    }
  }

  window.addEventListener("pangu:scroll", (event) => {
    scroll = {
      progress: clamp(event.detail.progress, 0, chapters.length - 1),
      ending: event.detail.ending,
    };
  });
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    pointer.x = event.clientX / window.innerWidth * 2 - 1;
    pointer.y = event.clientY / window.innerHeight * 2 - 1;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.x = pointer.y = 0; });
  document.addEventListener("visibilitychange", () => { document.hidden ? pause() : start(); });
  reducedMotion.addEventListener("change", () => { reducedMotion.matches ? showStatic() : start(); });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showStatic();
    render = null;
  });
  canvas.addEventListener("webglcontextrestored", start);
  root.dataset.particles = reducedMotion.matches ? "static" : "loading";
  start();
})();
