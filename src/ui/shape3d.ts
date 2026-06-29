// Vista previa 3D ligera (WebGL2) para el visor de texturas: aplica una textura
// a una esfera, cilindro o cubo, con auto-rotación y una luz direccional simple.
// Sin dependencias externas — geometría generada en código y un par de shaders.

export type Shape = 'sphere' | 'cylinder' | 'cube';

interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

// ---- generación de mallas -------------------------------------------------

function sphereMesh(seg = 48, rings = 32): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const phi = v * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const u = x / seg;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(nx, ny, nz);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const stride = seg + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < seg; x++) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return toMesh(positions, normals, uvs, indices);
}

function cylinderMesh(seg = 48): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const h = 1.0;
  // lateral
  for (let y = 0; y <= 1; y++) {
    for (let x = 0; x <= seg; x++) {
      const u = x / seg;
      const theta = u * Math.PI * 2;
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      positions.push(nx, (y - 0.5) * 2 * h, nz);
      normals.push(nx, 0, nz);
      uvs.push(u, 1 - y);
    }
  }
  const stride = seg + 1;
  for (let x = 0; x < seg; x++) {
    const a = x;
    const b = a + stride;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // tapas
  const cap = (sign: number) => {
    const center = positions.length / 3;
    positions.push(0, sign * h, 0);
    normals.push(0, sign, 0);
    uvs.push(0.5, 0.5);
    const start = positions.length / 3;
    for (let x = 0; x <= seg; x++) {
      const theta = (x / seg) * Math.PI * 2;
      const cx = Math.cos(theta);
      const cz = Math.sin(theta);
      positions.push(cx, sign * h, cz);
      normals.push(0, sign, 0);
      uvs.push(cx * 0.5 + 0.5, cz * 0.5 + 0.5);
    }
    for (let x = 0; x < seg; x++) {
      if (sign > 0) indices.push(center, start + x, start + x + 1);
      else indices.push(center, start + x + 1, start + x);
    }
  };
  cap(1);
  cap(-1);
  return toMesh(positions, normals, uvs, indices);
}

function cubeMesh(): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // 6 caras, cada una con su normal y UV 0..1.
  const faces: { n: [number, number, number]; verts: [number, number, number][] }[] = [
    { n: [0, 0, 1], verts: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], verts: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], verts: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], verts: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], verts: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], verts: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];
  const uvQuad: [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (const f of faces) {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      positions.push(...f.verts[i]);
      normals.push(...f.n);
      uvs.push(...uvQuad[i]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return toMesh(positions, normals, uvs, indices);
}

function toMesh(p: number[], n: number[], u: number[], i: number[]): Mesh {
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    uvs: new Float32Array(u),
    indices: new Uint16Array(i),
  };
}

function buildMesh(shape: Shape): Mesh {
  if (shape === 'sphere') return sphereMesh();
  if (shape === 'cylinder') return cylinderMesh();
  return cubeMesh();
}

// ---- matrices -------------------------------------------------------------

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4Identity(): Float32Array {
  // prettier-ignore
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function rotateY(m: Float32Array, a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  const r = mat4Identity();
  r[0] = c; r[2] = -s; r[8] = s; r[10] = c;
  return mul(m, r);
}
function rotateX(m: Float32Array, a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  const r = mat4Identity();
  r[5] = c; r[6] = s; r[9] = -s; r[10] = c;
  return mul(m, r);
}
function translate(m: Float32Array, x: number, y: number, z: number): Float32Array {
  const t = mat4Identity();
  t[12] = x; t[13] = y; t[14] = z;
  return mul(m, t);
}
function mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
// normal matrix = transpuesta de la inversa del 3x3 del modelo. Como aquí el modelo
// es solo rotación (ortonormal), la propia rotación sirve como normal matrix.
function normalMat3(m: Float32Array): Float32Array {
  // prettier-ignore
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

// ---- shaders --------------------------------------------------------------

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
uniform mat4 uProj;
uniform mat4 uModelView;
uniform mat3 uNormal;
out vec3 vNormal;
out vec2 vUv;
void main() {
  vNormal = normalize(uNormal * aNormal);
  vUv = aUv;
  gl_Position = uProj * uModelView * vec4(aPos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 frag;
void main() {
  vec3 base = texture(uTex, vUv).rgb;
  vec3 L = normalize(vec3(0.5, 0.8, 0.6));
  float diff = max(dot(normalize(vNormal), L), 0.0);
  float light = 0.35 + 0.65 * diff;           // ambiente + difusa
  frag = vec4(base * light, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile error');
  }
  return sh;
}

// ---- visor ----------------------------------------------------------------

export interface ShapeViewer {
  setShape(shape: Shape): void;
  dispose(): void;
}

/**
 * Monta un visor 3D con auto-rotación dentro de `canvas`, aplicando `image`
 * como textura. Devuelve un control para cambiar de forma o destruirlo.
 */
export function createShapeViewer(canvas: HTMLCanvasElement, image: TexImageSource, shape: Shape): ShapeViewer {
  const ctx = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!ctx) throw new Error('WebGL2 not available for the 3D view');
  const gl: WebGL2RenderingContext = ctx;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? 'program link error');
  }
  gl.useProgram(prog);

  const uProj = gl.getUniformLocation(prog, 'uProj');
  const uModelView = gl.getUniformLocation(prog, 'uModelView');
  const uNormal = gl.getUniformLocation(prog, 'uNormal');
  const uTex = gl.getUniformLocation(prog, 'uTex');

  // textura
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(uTex, 0);

  // VAO + buffers (se rellenan en uploadMesh)
  const vao = gl.createVertexArray()!;
  const posBuf = gl.createBuffer()!;
  const normBuf = gl.createBuffer()!;
  const uvBuf = gl.createBuffer()!;
  const idxBuf = gl.createBuffer()!;
  let indexCount = 0;

  function uploadMesh(m: Mesh) {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, m.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, m.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, m.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    indexCount = m.indices.length;
    gl.bindVertexArray(null);
  }

  let currentShape: Shape = shape;
  uploadMesh(buildMesh(shape));

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.047, 0.055, 0.071, 1); // ~ #0c0e12

  let angle = 0;
  let raf = 0;
  let last = 0;
  let alive = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Respeta "movimiento reducido": sin auto-rotación (se queda en un ángulo fijo).
  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame(t: number) {
    if (!alive) return;
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    if (!reduceMotion) angle += dt * 0.3; // rad/s

    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height || 1;
    const proj = perspective((50 * Math.PI) / 180, aspect, 0.1, 100);

    let model = mat4Identity();
    model = rotateY(model, angle);
    // La esfera se ve mejor algo inclinada; cubo y cilindro, de frente.
    if (currentShape === 'sphere') model = rotateX(model, 0.35);
    const view = translate(mat4Identity(), 0, 0, -3.2);
    const modelView = mul(view, model);

    gl.uniformMatrix4fv(uProj, false, proj);
    gl.uniformMatrix4fv(uModelView, false, modelView);
    gl.uniformMatrix3fv(uNormal, false, normalMat3(model));

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setShape(s: Shape) {
      currentShape = s;
      uploadMesh(buildMesh(s));
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(normBuf);
      gl.deleteBuffer(uvBuf);
      gl.deleteBuffer(idxBuf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}
