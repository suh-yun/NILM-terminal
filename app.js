// 실시간 전류 수신 + 전력으로 계산 + 실시간으로 띄우기


const viewEl = document.getElementById("view");
const btnPower = document.getElementById("btn-power");
const btnCommunity = document.getElementById("btn-community");
let btnClassrooms = document.getElementById("btn-classrooms");

const ESP32_IP_ONLY = "10.63.101.69"; 
const ESP32_HTTP_BASE = `http://${ESP32_IP_ONLY}`;

// 페이지 로드 시 실행
window.onload = function() {
    console.log('데이터 수신 시작 (HTTP Polling)...');
    // 1초마다 데이터
    setInterval(fetchData, 1000); 
};

async function fetchData() {
    try {
        // ESP32에 데이터 요청
        const response = await fetch(`http://${ESP32_IP_ONLY}/data`);
        if (!response.ok) throw new Error('네트워크 응답 없음');
        
        const data = await response.json();
        console.log('수신 데이터:', data);

        // --- 데이터 반영 로직 ---
     
        const powerH = data.rmsH * 220; 
        // 1. [데이터 원본 업데이트]
        if (typeof buildings !== 'undefined') {
            buildings.forEach(b => {
                b.classrooms.forEach(c => {
                    c.devices.forEach(d => {
                   
                        if (d.name === "공기청정기") { 
                            d.currentW = powerH;
                            d.isOn = powerH > 5;
                        }
                    });
                });
            });
        }

        // 2. [화면 갱신] render 함수 호출
        if (typeof render === "function") {
            render();
        }

    } catch (error) {
        console.error('데이터를 가져오는데 실패했습니다:', error);
    }
}


function sendRelayControl(targetDevice, cmd) {
    alert("현재 아두이노 코드에 제어 기능이 설정되지 않았습니다.");
}

async function pollEsp32Once() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(800, ESP32_POLL_INTERVAL_MS - 50));
  try {
    const res = await fetch(ESP32_POLL_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyEsp32Reading(data);
  } catch (err) {
    
    console.warn("[ESP32 폴링 실패]", String(err?.message ?? err));
  } finally {
    clearTimeout(timeoutId);
  }
}

function startPolling() {
  if (pollTimer) return;
  console.log(`[ESP32 폴링 시작] ${ESP32_POLL_URL} (${ESP32_POLL_INTERVAL_MS}ms)`);
  pollEsp32Once(); 
  pollTimer = setInterval(pollEsp32Once, ESP32_POLL_INTERVAL_MS);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}


// 릴레이를 끄차단 함수
async function sendRelayControl(targetDevice, cmd) {
  try {
    const payload =
      targetDevice
        ? { target: targetDevice, command: cmd }
        : { power: cmd };

    const res = await fetch(`${ESP32_HTTP_BASE}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[제어 신호 전송] ${targetDevice || "(global)"} -> ${cmd}`);
  } catch (e) {
    console.error("ESP32 제어 요청 실패:", e);
    alert("장치 제어 요청에 실패했습니다. (IP/서버 경로 확인)");
  }
}
btnPower?.addEventListener("click", () => {
  location.hash = "#/";
});


btnCommunity?.addEventListener("click", () => {
  location.hash = "#/community";
});


btnClassrooms?.addEventListener("click", () => {
  location.hash = `#/classrooms/${encodeURIComponent(defaultBuildingId())}`;
});


const data = window.POWER_DASHBOARD_DATA;
const buildings = Array.isArray(data?.buildings) ? data.buildings : (data?.building ? [data.building] : []);
if (buildings.length === 0) {
  viewEl.innerHTML = `
    <section class="card pad">
      <div class="h1">데이터를 불러오지 못했습니다</div>
      <div class="muted">
        <code>data.js</code>가 로드되지 않았거나 브라우저에서 스크립트 실행이 차단되었을 수 있어요.
        <br />
        같은 폴더의 <code>index.html</code>을 다시 열어보거나, 로컬 서버로 실행해보세요.
      </div>
    </section>
  `;
  // stop early
  throw new Error("POWER_DASHBOARD_DATA.buildings is missing");
}


function getBuilding(buildingId) {
  return buildings.find((b) => b.id === buildingId) ?? null;
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatW(w) {
  const n = Math.round(w);
  return `${n.toLocaleString("ko-KR")} W`;
}


function getNoteKey(classroomId, deviceId) {
  return `powerDashboard.note.${classroomId}.${deviceId}`;
}


function getLockKey(buildingId, classroomId, deviceId) {
  return `powerDashboard.lock.${buildingId}.${classroomId}.${deviceId}`;
}


function getDeviceStateKey(buildingId, classroomId, deviceId) {
  return `powerDashboard.deviceState.${buildingId}.${classroomId}.${deviceId}`;
}


function getNote(classroomId, deviceId) {
  try {
    return localStorage.getItem(getNoteKey(classroomId, deviceId)) ?? "";
  } catch {
    return "";
  }
}


function safeBool(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}


function loadDeviceState(buildingId, classroomId, deviceId) {
  try {
    const raw = localStorage.getItem(getDeviceStateKey(buildingId, classroomId, deviceId));
    const parsed = safeJsonParse(raw ?? "null", null);
    if (!parsed || typeof parsed !== "object") return {};
    const isOn = safeBool(parsed.isOn);
    const isWorking = safeBool(parsed.isWorking);
    return {
      ...(typeof isOn === "boolean" ? { isOn } : {}),
      ...(typeof isWorking === "boolean" ? { isWorking } : {}),
    };
  } catch {
    return {};
  }
}


function saveDeviceState(buildingId, classroomId, deviceId, patch) {
  try {
    const prev = loadDeviceState(buildingId, classroomId, deviceId);
    const next = { ...prev, ...patch };
    localStorage.setItem(getDeviceStateKey(buildingId, classroomId, deviceId), JSON.stringify(next));
  } catch {
    // ignore
  }
}


function isLocked(buildingId, classroomId, deviceId) {
  try {
    return localStorage.getItem(getLockKey(buildingId, classroomId, deviceId)) === "1";
  } catch {
    return false;
  }
}


function setNote(classroomId, deviceId, note) {
  try {
    localStorage.setItem(getNoteKey(classroomId, deviceId), note);
  } catch {
  }
}


function setLocked(buildingId, classroomId, deviceId, locked) {
  try {
    localStorage.setItem(getLockKey(buildingId, classroomId, deviceId), locked ? "1" : "0");
  } catch {
  }
}



const ENERGY_SAVING_OFF_DEVICES = new Set([
  "조명(전등)",
  "공기청정기",
  "프로젝터",
  "환풍기",
  "실험 장비",
  "에어컨",
]);


function effectiveDevice(buildingId, classroomId, device) {
  const state = loadDeviceState(buildingId, classroomId, device.id);
  const baseOn = !!device.isOn;
  let isOn = typeof state.isOn === "boolean" ? state.isOn : baseOn;


 
  if (loadEnergySavingEnabled() && ENERGY_SAVING_OFF_DEVICES.has(device.name)) {
    isOn = false;
  }


  const isWorking =
    typeof state.isWorking === "boolean"
      ? state.isWorking
      : isOn
        ? true
        : false;
  return {
    ...device,
    isOn,
    isWorking,
    effectiveW: isOn ? Number(device.currentW ?? 0) : 0,
  };
}


function classroomTotalW(classroom) {
  return classroom.devices
    .map((d) => effectiveDevice(classroom._buildingId, classroom.id, d))
    .filter((d) => d.isOn && d.effectiveW > 0)
    .reduce((acc, d) => acc + d.effectiveW, 0);
}


function buildingTotalW(building) {
  return building.classrooms.reduce((acc, c) => acc + classroomTotalW({ ...c, _buildingId: building.id }), 0);
}



function theoreticalBuildingTotalW(building) {
  return building.classrooms.reduce(
    (acc, c) =>
      acc +
      c.devices.reduce((inner, d) => {
        return inner + Number(d.currentW ?? 0);
      }, 0),
    0,
  );
}


function activeDeviceCount(building) {
  return building.classrooms.reduce((acc, c) => {
    return (
      acc +
      c.devices
        .map((d) => effectiveDevice(building.id, c.id, d))
        .filter((d) => d.isOn && d.effectiveW > 0).length
    );
  }, 0);
}


// 전체 활성 기기 목록 (건물·강의실·기기명)
function getAllActiveDevices() {
  const list = [];
  for (const b of buildings) {
    const buildingShort = b.id === "ASAN" ? "공A" : b.id === "NEW" ? "공B" : b.name;
    for (const c of b.classrooms) {
      for (const d of c.devices) {
        const dev = effectiveDevice(b.id, c.id, d);
        if (dev.isOn && dev.effectiveW > 0) {
          list.push({
            buildingId: b.id,     
            classroomId: c.id,    
            deviceId: d.id,       
            buildingName: b.name,
            buildingShort,
            deviceName: d.name,
            deviceW: dev.effectiveW,
            label: `${buildingShort} ${c.id} ${d.name}`,
          });
        }
      }
    }
  }
  return list;
}




function floorOrderKey(floorId) {
  const f = String(floorId);
  if (f.startsWith("B")) {
    const n = Number(f.slice(1));
    return -100 - (Number.isFinite(n) ? n : 0);
  }
  const n = Number(f);
  return Number.isFinite(n) ? n : 0;
}


function getTreesMonthKey() {
  return "powerDashboard.trees.monthKey";
}


function getTreesBaselineKey() {
  return "powerDashboard.trees.baselineSavedW";
}



function loadTreesMonthlyBaseline(currentSavedW) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;


  try {
    const storedMonth = localStorage.getItem(getTreesMonthKey());
    const storedBaselineRaw = localStorage.getItem(getTreesBaselineKey());
    const storedBaseline = Number(storedBaselineRaw);


    if (!storedMonth || storedMonth !== monthKey || !Number.isFinite(storedBaseline)) {
      localStorage.setItem(getTreesMonthKey(), monthKey);
      localStorage.setItem(getTreesBaselineKey(), String(currentSavedW));
      return { monthKey, baselineSavedW: currentSavedW };
    }


    return { monthKey, baselineSavedW: storedBaseline };
  } catch {
    return { monthKey, baselineSavedW: currentSavedW };
  }
}



function calcEnergySavingTrees() {
  const currentTotalW = buildings.reduce((acc, b) => acc + buildingTotalW(b), 0);
  const theoreticalTotalW = buildings.reduce((acc, b) => acc + theoreticalBuildingTotalW(b), 0);
  const rawSavedW = Math.max(0, theoreticalTotalW - currentTotalW);


  const perTreeW = 400;
  const rawTrees = perTreeW > 0 ? Math.round(rawSavedW / perTreeW) : 0;
  const trees = Math.max(0, rawTrees);

  const maxDisplay = 30;
  const displayTrees = Math.min(trees, maxDisplay);

  const ratio = theoreticalTotalW > 0 ? Math.min(1, rawSavedW / theoreticalTotalW) : 0;
  const scale = 0.85 + 0.2 * ratio;

  return {
    trees,
    displayTrees,
    scale,
  };
}


function defaultBuildingId() {
  return buildings[0]?.id ?? "ASAN";
}


function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { hour12: false });
  } catch {
    return iso;
  }
}



function lastNDaysLabels(n) {
  const labels = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
}

const DEMO_DAILY_FACTORS = [0.8, 0.9, 1.0, 1.1, 0.95, 1.05, 0.9];
const CHART_COLORS = [
  "rgba(34, 197, 94, 1)",   // green
  "rgba(59, 130, 246, 1)",  // blue
  "rgba(234, 179, 8, 1)",   // yellow
  "rgba(239, 68, 68, 1)",   // red
  "rgba(139, 92, 246, 1)",  // purple
];


function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}


function getCommunityPostsKey() {
  return "powerDashboard.community.posts";
}


function getEnergySavingKey() {
  return "powerDashboard.energySaving.enabled";
}


function loadEnergySavingEnabled() {
  try {
    return localStorage.getItem(getEnergySavingKey()) === "1";
  } catch {
    return false;
  }
}


function saveEnergySavingEnabled(enabled) {
  try {
    localStorage.setItem(getEnergySavingKey(), enabled ? "1" : "0");
  } catch {
    // ignore
  }
}


function loadCommunityPosts() {
  try {
    const raw = localStorage.getItem(getCommunityPostsKey());
    const posts = safeJsonParse(raw ?? "[]", []);
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}


function saveCommunityPosts(posts) {
  try {
    localStorage.setItem(getCommunityPostsKey(), JSON.stringify(posts));
  } catch {
    // ignore
  }
}


function getProfileKey() {
  return "powerDashboard.community.profile";
}


function loadProfile() {
  const fallback = { role: "student", value: "1" };
  try {
    const raw = localStorage.getItem(getProfileKey());
    const parsed = safeJsonParse(raw ?? "null", null);
    if (!parsed || typeof parsed !== "object") return fallback;
    const role = parsed.role;
    const value = parsed.value;
    if (typeof role !== "string" || typeof value !== "string") return fallback;
    return { role, value };
  } catch {
    return fallback;
  }
}


function saveProfile(profile) {
  try {
    localStorage.setItem(getProfileKey(), JSON.stringify(profile));
  } catch {
    // ignore
  }
}


function profileDisplay(profile) {
  const role = profile?.role;
  const value = (profile?.value ?? "").trim();
  if (role === "guard") return "경비";
  if (role === "student") return `학생(${value || "1"})`;
  if (role === "staff") return `교직원(${value || "1"})`;
  if (role === "professor") return value || "교수";
  return "사용자";
}


function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  // routes:
  // - /           -> home
  // - /classrooms/:buildingId?/:floorId? -> classroom list
  // - /classroom/:buildingId/:classroomId -> detail
  // - /device/:buildingId/:classroomId/:deviceId -> device detail
  // - /community  -> community
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "classrooms") return { name: "classrooms", buildingId: parts[1] ?? null, floorId: parts[2] ?? null };
  if (parts[0] === "classroom" && parts[1] && parts[2]) return { name: "classroom", buildingId: parts[1], classroomId: parts[2] };
  if (parts[0] === "device" && parts[1] && parts[2] && parts[3]) return { name: "device", buildingId: parts[1], classroomId: parts[2], deviceId: parts[3] };
  // legacy: /classroom/:id
  if (parts[0] === "classroom" && parts[1] && !parts[2]) return { name: "classroom-legacy", id: parts[1] };
  if (parts[0] === "community") return { name: "community" };
  return { name: "notfound" };
}


function setView(html) {
  viewEl.innerHTML = html;
}


function mountInteractions({ buildingId, classroomId } = {}) {
  // note save
  const noteForms = Array.from(document.querySelectorAll("[data-note-form]"));
  for (const form of noteForms) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const deviceId = form.getAttribute("data-device-id");
      const input = form.querySelector("input");
      if (!classroomId || !deviceId || !(input instanceof HTMLInputElement)) return;
      setNote(classroomId, deviceId, input.value.trim());
      render(); // 저장 후 재렌더 → 밑에 메모 표시
    });
  }


  // lock toggle
  const lockButtons = Array.from(document.querySelectorAll("[data-lock-btn]"));
  for (const btn of lockButtons) {
    btn.addEventListener("click", () => {
      const deviceId = btn.getAttribute("data-device-id");
      if (!buildingId || !classroomId || !deviceId) return;
      const next = !isLocked(buildingId, classroomId, deviceId);
      setLocked(buildingId, classroomId, deviceId, next);
      render(); // 상태 갱신
    });
  }
}


function renderClassroomsPage(buildingId, floorId) {
  // 강의실 페이지 레이아웃:
  // - 맨 위: 검색창
  // - 중간: 아산공학관 / 신공학관 단면도 나란히
  // - 맨 아래: 모든 강의실 리스트 (검색 + 단면도 층 선택으로 필터)


  const allClassrooms = [];
  for (const b of buildings) {
    for (const c of b.classrooms) {
      allClassrooms.push({
        ...c,
        buildingId: b.id,
        buildingName: b.name,
      });
    }
  }


  setView(`
    <div class="grid">
      <section class="card pad col-span-12">
        <div class="toolbar">
          <div>
            <div class="h1">강의실</div>
            <div class="muted">검색창과 단면도를 이용해 강의실을 찾아볼 수 있어요.</div>
          </div>
          <div class="input classrooms-search" role="search">
            <span class="muted" aria-hidden="true">검색</span>
            <input id="search" placeholder="예) A201, N502, B1, 아산" autocomplete="off" />
          </div>
        </div>
      </section>


      <section class="card pad col-span-12">
        <div class="building-diagram" aria-label="건물 단면(층 선택)">
          ${buildings
            .map((bb) => {
              const floors =
                Array.isArray(bb.floors) && bb.floors.length > 0
                  ? bb.floors.slice()
                  : Array.from(new Set(bb.classrooms.map((c) => c.floor))).sort((x, y) => floorOrderKey(y) - floorOrderKey(x));
              return `
                <div class="building-column">
                  <div class="building-title">${escapeHtml(bb.name)}</div>
                  <div class="floors">
                    ${floors
                      .map((f) => {
                        const isBasement = String(f).startsWith("B");
                        return `
                          <button
                            type="button"
                            class="floor-btn ${isBasement ? "basement" : ""}"
                            data-building-id="${escapeHtml(bb.id)}"
                            data-floor="${escapeHtml(String(f))}"
                          >
                            <span class="floor-label">${escapeHtml(String(f))}층</span>
                          </button>
                        `;
                      })
                      .join("")}
                    <button
                      type="button"
                      class="floor-btn"
                      data-building-id="${escapeHtml(bb.id)}"
                      data-floor=""
                    >
                      <span class="floor-label">전체</span>
                    </button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>


      <section class="card pad col-span-12">
        <div class="h1">강의실 목록</div>
        <div class="muted">검색 및 층 선택 결과가 아래에 표시됩니다.</div>
        <div style="height: 12px"></div>
        <div id="classroom-list" class="list"></div>
      </section>
    </div>
  `);


  const listEl = document.getElementById("classroom-list");
  const searchEl = document.getElementById("search");


  let activeBuildingId = null;
  let activeFloor = null;


  function renderList() {
    const q = (searchEl?.value ?? "").trim().toLowerCase();
    const base = allClassrooms.slice().sort((a, bb) => String(a.name).localeCompare(String(bb.name)));


    const filtered = base.filter((c) => {
      if (activeBuildingId && c.buildingId !== activeBuildingId) return false;
      if (activeFloor && c.floor !== activeFloor) return false;
      if (!q) return true;
      const hay = `${c.id} ${c.name} ${c.floor} ${c.buildingName} ${c.buildingId}`.toLowerCase();
      return hay.includes(q);
    });


    listEl.innerHTML =
      filtered.length === 0
        ? `<div class="muted">해당 조건에 맞는 강의실이 없습니다.</div>`
        : filtered
            .map((c) => {
              const w = classroomTotalW({ ...c, _buildingId: c.buildingId });
              const active = c.devices
                .map((d) => effectiveDevice(c.buildingId, c.id, d))
                .filter((d) => d.isOn && d.effectiveW > 0).length;
              return `
                <button
                  class="row as-button"
                  type="button"
                  data-classroom-id="${escapeHtml(c.id)}"
                  data-building-id="${escapeHtml(c.buildingId)}"
                >
                  <div>
                    <div class="title">${escapeHtml(c.name)}</div>
                    <div class="sub">${escapeHtml(c.buildingName)} · ${escapeHtml(String(c.floor))}층 · 활성 기기 ${active}개</div>
                  </div>
                  <div class="badge" title="현재 소비 전력">
                    <span class="dot" aria-hidden="true"></span>
                    <span>${formatW(w)}</span>
                  </div>
                  <div class="muted">열기 →</div>
                  <div></div>
                </button>
              `;
            })
            .join("");


    for (const btn of Array.from(listEl.querySelectorAll("[data-classroom-id]"))) {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-classroom-id");
        const bid = btn.getAttribute("data-building-id");
        if (!id || !bid) return;
        location.hash = `#/classroom/${encodeURIComponent(bid)}/${encodeURIComponent(id)}`;
      });
    }
  }


  function updateFloorButtons() {
    const floorBtns = Array.from(document.querySelectorAll("[data-building-id][data-floor]"));
    for (const btn of floorBtns) {
      const bid = btn.getAttribute("data-building-id");
      const floor = btn.getAttribute("data-floor") ?? "";
      const isActive =
        activeBuildingId === bid && (activeFloor ?? "") === (floor || "");
      btn.classList.toggle("active", isActive);
    }
  }

  renderList();
  updateFloorButtons();


  searchEl?.addEventListener("input", () => {
    renderList();
  });

  for (const floorBtn of Array.from(document.querySelectorAll("[data-building-id][data-floor]"))) {
    floorBtn.addEventListener("click", () => {
      const bid = floorBtn.getAttribute("data-building-id");
      const floor = floorBtn.getAttribute("data-floor") ?? "";
      const normalizedFloor = floor || "";
      const isSame =
        activeBuildingId === bid && (activeFloor ?? "") === normalizedFloor;


      if (isSame) {
        activeBuildingId = null;
        activeFloor = null;
      } else {
        activeBuildingId = bid;
        activeFloor = floor || null;
      }


      updateFloorButtons();
      renderList();
    });
  }
}


function renderCommunity() {
  const profile = loadProfile();
  const posts = loadCommunityPosts()
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));


  const treeStats = calcEnergySavingTrees();
  const treeLabel =
    treeStats.trees > 0
      ? `오늘 기준으로 약 ${treeStats.trees.toLocaleString("ko-KR")}그루의 나무를 심은 효과가 있어요.`
      : "아직 절약된 전력이 거의 없어요. 에너지 절약 모드를 켜거나 기기 전원을 끄면 나무가 자라요!";



  const treesHtml =
    treeStats.displayTrees > 0
      ? Array.from({ length: treeStats.displayTrees })
          .map(
            () =>
              `<span class="tree-emoji" style="--tree-scale:${treeStats.scale.toFixed(2)};" aria-hidden="true">🌳</span>`
          )
          .join("")
      : "";


  const forestHtml = `
    <div class="tree-island">
      <div class="tree-forest" aria-label="나무 ${treeStats.trees}그루">
        ${treesHtml}
      </div>
    </div>
    ${
      treeStats.displayTrees === 0
        ? `<div class="muted" style="font-size: 12px; margin-top: 6px;">에너지 절약 모드를 켜면 꺼지는 기기만으로도 나무가 자라요!</div>`
        : ""
    }
  `;


  setView(`
    <div class="grid">
      <section class="card pad col-span-12">
        <div class="kpi">
          <div>
            <h1 class="h1">커뮤니티</h1>
            <div class="muted">전기 사용 관련해서 자유롭게 글을 올릴 수 있어요. (데모: 브라우저에만 저장)</div>
          </div>
          <div class="badge" title="현재 프로필">
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml(profileDisplay(profile))}</span>
          </div>
        </div>
      </section>


      <section class="card pad col-span-12">
        <div class="tree-section">
          <div>
            <div class="h1">에너지 절약 나무</div>
            <div class="muted">이번 달 절약된 전력량을 나무 그루 수로 표현해요.</div>
            <div class="muted" style="margin-top: 6px; font-size: 12px;">
              ${treeLabel}
            </div>
          </div>
          <div class="tree-count-badge" title="절약된 전력량을 나무로 환산한 값">
            <span class="big-number">${treeStats.trees.toLocaleString("ko-KR")}</span>
            <span class="unit">그루</span>
          </div>
        </div>
        <div style="height: 10px"></div>
        ${forestHtml}
      </section>


      <section class="card pad col-span-6">
        <div class="h1">프로필</div>
        <div class="muted">역할에 따라 표시명이 자동으로 정해집니다.</div>
        <div style="height: 12px"></div>
        <form id="profile-form" class="list">
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <select id="role" class="select" aria-label="역할">
              <option value="guard">경비</option>
              <option value="student">학생</option>
              <option value="staff">교직원</option>
              <option value="professor">교수</option>
            </select>
            <input id="role-value" class="input" style="max-width: 280px;" placeholder="번호 또는 이름" />
            <button class="btn" type="submit">저장</button>
            <span id="profile-preview" class="muted"></span>
          </div>
          <div class="muted" style="font-size: 12px;">
            - 경비: <b>경비</b><br/>
            - 학생: <b>학생(아무숫자)</b><br/>
            - 교직원: <b>교직원(아무숫자)</b><br/>
            - 교수: <b>이름</b>
          </div>
        </form>
      </section>


      <section class="card pad col-span-6">
        <div class="h1">글 작성</div>
        <div class="muted">공지사항/자유글을 선택해 올릴 수 있어요.</div>
        <div style="height: 12px"></div>
        <form id="post-form" class="list">
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <select id="post-type" class="select" aria-label="글 종류">
              <option value="post">자유글</option>
              <option value="notice">공지사항</option>
            </select>
            <input id="post-title" class="input" style="flex:1; min-width: 260px;" placeholder="제목" />
          </div>
          <textarea id="post-body" class="textarea" placeholder="내용"></textarea>
          <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
            <div class="muted" style="font-size:12px;">작성자: <b>${escapeHtml(profileDisplay(profile))}</b></div>
            <button class="btn primary" type="submit">등록</button>
          </div>
        </form>
      </section>


      <section class="card pad col-span-12">
        <div class="toolbar">
          <div>
            <div class="h1">게시글</div>
            <div class="muted">공지사항과 자유글을 함께 확인할 수 있어요.</div>
          </div>
          <div class="tabs" role="tablist" aria-label="게시글 필터">
            <button class="tab active" type="button" data-tab="all">전체</button>
            <button class="tab" type="button" data-tab="notice">공지사항</button>
            <button class="tab" type="button" data-tab="post">자유글</button>
          </div>
        </div>
        <div style="height: 12px"></div>
        <div id="posts" class="list"></div>
      </section>
    </div>
  `);


  const roleEl = document.getElementById("role");
  const roleValueEl = document.getElementById("role-value");
  const profileForm = document.getElementById("profile-form");
  const profilePreview = document.getElementById("profile-preview");


  const postForm = document.getElementById("post-form");
  const postTypeEl = document.getElementById("post-type");
  const postTitleEl = document.getElementById("post-title");
  const postBodyEl = document.getElementById("post-body");


  const postsEl = document.getElementById("posts");


  function normalizeRoleValue(role, value) {
    const v = String(value ?? "").trim();
    if (role === "guard") return "";
    if (role === "professor") return v || "교수";
    // student/staff numeric-ish
    const digits = v.replaceAll(/\D/g, "");
    return digits || "1";
  }


  function setRoleUIFromProfile(p) {
    if (roleEl) roleEl.value = p.role;
    if (roleValueEl) roleValueEl.value = p.value;
    if (profilePreview) profilePreview.textContent = `→ ${profileDisplay(p)}`;
    // disable input for guard
    if (roleValueEl) {
      roleValueEl.disabled = p.role === "guard";
      roleValueEl.placeholder = p.role === "professor" ? "이름" : "번호";
      if (p.role === "guard") roleValueEl.value = "";
    }
  }


  setRoleUIFromProfile(profile);


  roleEl?.addEventListener("change", () => {
    const role = roleEl.value;
    const next = { role, value: normalizeRoleValue(role, roleValueEl?.value) };
    setRoleUIFromProfile(next);
  });


  roleValueEl?.addEventListener("input", () => {
    const role = roleEl?.value ?? "student";
    const next = { role, value: normalizeRoleValue(role, roleValueEl?.value) };
    if (profilePreview) profilePreview.textContent = `→ ${profileDisplay(next)}`;
  });


  profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const role = roleEl?.value ?? "student";
    const value = normalizeRoleValue(role, roleValueEl?.value);
    const next = { role, value };
    saveProfile(next);
    location.hash = "#/community"; // rerender (badge/author line 갱신)
    render();
  });


  let activeTab = "all";


  function renderPosts() {
    const profileNow = loadProfile();
    const myName = profileDisplay(profileNow);
    const list = loadCommunityPosts()
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));


    const filtered =
      activeTab === "all" ? list : list.filter((p) => p.type === activeTab);


    if (filtered.length === 0) {
      postsEl.innerHTML = `<div class="muted">아직 게시글이 없습니다.</div>`;
      return;
    }


    postsEl.innerHTML = filtered
      .map((p) => {
        const typeLabel = p.type === "notice" ? "공지" : "자유";
        const canDelete = String(p.author ?? "") === String(myName);
        return `
          <article class="post">
            <div class="post-title">${escapeHtml(p.title || "(제목 없음)")}</div>
            <div class="post-meta">
              <span class="badge"><span class="dot" aria-hidden="true"></span><span>${escapeHtml(typeLabel)}</span></span>
              <span>작성자: <b>${escapeHtml(p.author || "사용자")}</b></span>
              <span>작성일: ${escapeHtml(formatDateTime(p.createdAt))}</span>
              ${canDelete ? `<button class="btn danger small" type="button" data-delete-post="${escapeHtml(p.id)}">삭제</button>` : ""}
            </div>
            <div style="white-space: pre-wrap; line-height: 1.55;">${escapeHtml(p.body || "")}</div>
          </article>
        `;
      })
      .join("");


    for (const delBtn of Array.from(postsEl.querySelectorAll("[data-delete-post]"))) {
      delBtn.addEventListener("click", () => {
        const id = delBtn.getAttribute("data-delete-post");
        if (!id) return;
        const next = loadCommunityPosts().filter((p) => p.id !== id);
        saveCommunityPosts(next);
        renderPosts();
      });
    }
  }


  for (const tabBtn of Array.from(document.querySelectorAll("[data-tab]"))) {
    tabBtn.addEventListener("click", () => {
      activeTab = tabBtn.getAttribute("data-tab") || "all";
      for (const b of Array.from(document.querySelectorAll("[data-tab]"))) {
        b.classList.toggle("active", b.getAttribute("data-tab") === activeTab);
      }
      renderPosts();
    });
  }


  renderPosts();


  postForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const profileNow = loadProfile();
    const type = postTypeEl?.value === "notice" ? "notice" : "post";
    const title = (postTitleEl?.value ?? "").trim();
    const body = (postBodyEl?.value ?? "").trim();


    if (!title && !body) return;


    const nextPost = {
      id: `p_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      title,
      body,
      author: profileDisplay(profileNow),
      createdAt: new Date().toISOString(),
    };


    const next = loadCommunityPosts();
    next.unshift(nextPost);
    saveCommunityPosts(next);


    if (postTitleEl) postTitleEl.value = "";
    if (postBodyEl) postBodyEl.value = "";
    renderPosts();
  });
}


function renderHome() {
  const energySavingEnabled = loadEnergySavingEnabled();
  const totals = buildings.map((b) => ({
    id: b.id,
    name: b.name,
    totalW: buildingTotalW(b),
    activeDevices: activeDeviceCount(b),
    classroomCount: b.classrooms.length,
  }));


  const activeDeviceList = getAllActiveDevices();
  const totalActiveCount = totals.reduce((a, x) => a + x.activeDevices, 0);
  // renderHome 함수 내부에서 activeDeviceListHtml 변수를 만드는 부분을 찾아 아래로 교체하세요.
  const activeDeviceListHtml =
    activeDeviceList.length === 0
      ? `<div class="muted" style="padding: 12px; font-size: 13px;">활성 기기가 없습니다.</div>`
      : activeDeviceList
          .map(
            (item) =>
              `<div class="active-device-item">
                <a href="#/device/${encodeURIComponent(item.buildingId)}/${encodeURIComponent(item.classroomId)}/${encodeURIComponent(item.deviceId)}"
                  style="text-decoration: none; color: inherit; display: block; width: 100%;">
                  ${escapeHtml(item.label)}
                  <span class="muted" style="font-size: 11px;">${formatW(item.deviceW)}</span>
                </a>
              </div>`
          )
          .join("");


  setView(`
    <div class="grid">
      <section class="card pad col-span-12">
        <div class="kpi">
          <div>
            <h1 class="h1">전력 대시보드</h1>
            <div class="muted">건물 전체의 전력 요약을 확인합니다. 강의실 목록은 상단의 <b>강의실</b> 메뉴에서 확인하세요.</div>
          </div>
          <div class="active-devices-trigger-wrap">
            <button type="button" id="btn-active-devices" class="badge as-button" title="클릭하면 활성 기기 목록이 표시됩니다">
              <span class="dot" aria-hidden="true"></span>
              <span>전체 활성 기기 ${totalActiveCount.toLocaleString("ko-KR")}개</span>
            </button>
            <div id="active-devices-dropdown" class="active-devices-dropdown" role="listbox" aria-label="활성 기기 목록" hidden>
              <div class="active-devices-dropdown-title">활성 기기 목록</div>
              <div class="active-devices-dropdown-list">${activeDeviceListHtml}</div>
            </div>
          </div>
        </div>
      </section>


      <section class="card pad col-span-12">
        <div class="toolbar">
          <div>
            <div class="h1">에너지 절약 모드</div>
            <div class="muted">
              ON으로 설정하면 (추후) 절약 알고리즘이 자동으로 실행되도록 연결할 예정입니다.
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="badge" title="현재 상태">
              <span class="dot" aria-hidden="true" style="background:${energySavingEnabled ? "var(--accent-2)" : "var(--dot-off)"}"></span>
              <span>${energySavingEnabled ? "ON" : "OFF"}</span>
            </span>
            <button
              id="toggle-energy-saving"
              class="btn xl ${energySavingEnabled ? "success" : "primary"}"
              type="button"
            >
              ${energySavingEnabled ? "에너지 절약 모드 끄기" : "에너지 절약 모드 켜기"}
            </button>
          </div>
        </div>
      </section>


      ${totals
        .map((t) => {
          return `
            <section class="card pad col-span-6">
              <div class="kpi">
                <div>
                  <div class="label">${escapeHtml(t.name)} · 현재 총 소비 전력</div>
                  <div class="value">${formatW(t.totalW)}</div>
                  <div class="muted" style="margin-top: 6px; font-size: 12px;">
                    강의실 ${t.classroomCount.toLocaleString("ko-KR")}개 · 활성 기기 ${t.activeDevices.toLocaleString("ko-KR")}개
                  </div>
                </div>
              </div>
              <div style="height: 8px;"></div>
              <div class="muted" style="font-size: 12px;">
                최근 7일 일일 전력 사용 추이 (데모)
              </div>
              <div style="height: 4px;"></div>
              <div style="height: 120px;">
                <canvas
                  id="daily-power-chart-${escapeHtml(t.id)}"
                  aria-label="${escapeHtml(t.name)} 일일 전력 사용 추이 그래프"
                  role="img"
                ></canvas>
              </div>
            </section>
          `;
        })
        .join("")}


    </div>
  `);


  const btnActiveDevices = document.getElementById("btn-active-devices");
  const activeDevicesDropdown = document.getElementById("active-devices-dropdown");
  btnActiveDevices?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = activeDevicesDropdown?.hasAttribute("hidden");
    if (isHidden) {
      activeDevicesDropdown?.removeAttribute("hidden");
    } else {
      activeDevicesDropdown?.setAttribute("hidden", "");
    }
  });
  document.addEventListener("click", () => {
    activeDevicesDropdown?.setAttribute("hidden", "");
  });
  activeDevicesDropdown?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("toggle-energy-saving")?.addEventListener("click", () => {
    const next = !loadEnergySavingEnabled();
    saveEnergySavingEnabled(next);
    try {
      window.dispatchEvent(new CustomEvent("powerDashboard:energySavingChanged", { detail: { enabled: next } }));
    } catch {
      // ignore
    }
    render();
  });

  if (window.Chart) {
    const days = 7;
    const labels = lastNDaysLabels(days);
    const factors = DEMO_DAILY_FACTORS.slice(-days);


    totals.forEach((t, idx) => {
      const el = document.getElementById(`daily-power-chart-${t.id}`);
      if (!el) return;

      if (el._powerChart && typeof el._powerChart.destroy === "function") {
        el._powerChart.destroy();
      }


      const color = CHART_COLORS[idx % CHART_COLORS.length];
      const data = factors.map((f) => Math.round((t.totalW * f) / 1000));


      el._powerChart = new window.Chart(el.getContext("2d"), {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: t.name,
              data,
              borderColor: color,
              backgroundColor: "transparent",
              tension: 0.25,
              borderWidth: 2,
              pointRadius: 2.5,
              pointBackgroundColor: color,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label(context) {
                  const value = context.parsed.y;
                  return `${value.toLocaleString("ko-KR")} kWh (데모)`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 7,
                font: { size: 10 },
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                font: { size: 10 },
              },
            },
          },
        },
      });
    });
  }
}


function findClassroomLegacy(classroomId) {
  for (const b of buildings) {
    const c = b.classrooms.find((x) => x.id === classroomId);
    if (c) return { building: b, classroom: c };
  }
  return null;
}


function renderDeviceDetail(buildingId, classroomId, deviceId) {
  const bid = decodeURIComponent(buildingId ?? "");
  const cid = decodeURIComponent(classroomId ?? "");
  const did = decodeURIComponent(deviceId ?? "");


  const b = getBuilding(bid);
  const classroom = b?.classrooms.find((c) => c.id === cid) ?? null;
  const baseDevice = classroom?.devices.find((d) => d.id === did) ?? null;


  if (!b || !classroom || !baseDevice) {
    setView(`
      <section class="card pad">
        <div class="h1">기기를 찾을 수 없어요</div>
        <div class="muted">목록으로 돌아가서 다시 선택해 주세요.</div>
        <div style="height: 12px"></div>
        <button class="btn primary" type="button" id="go-back">강의실로</button>
      </section>
    `);
    document.getElementById("go-back")?.addEventListener("click", () => {
      location.hash = `#/classrooms/${encodeURIComponent(defaultBuildingId())}`;
    });
    return;
  }


  const device = effectiveDevice(b.id, classroom.id, baseDevice);
  const locked = isLocked(b.id, classroom.id, baseDevice.id);
  const note = escapeHtml(getNote(classroom.id, baseDevice.id));


  setView(`
    <div class="grid">
      <section class="card pad col-span-12">
        <div class="toolbar">
          <div>
            <div class="h1">${escapeHtml(device.name)}</div>
            <div class="muted">${escapeHtml(b.name)} · ${escapeHtml(classroom.name)} · 기기 ID: ${escapeHtml(device.id)}</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn ghost" type="button" id="back">← 강의실</button>
            ${locked ? `<span class="badge lock-badge" title="잠금 상태"><span class="dot" aria-hidden="true"></span><span>잠금</span></span>` : ""}
            <span class="badge" title="전원 상태"><span class="dot" aria-hidden="true"></span><span>${device.isOn ? "전원 ON" : "전원 OFF"}</span></span>
            <span class="badge" title="작업 상태"><span class="dot" aria-hidden="true"></span><span>${device.isWorking ? "작업중" : "작업 아님"}</span></span>
          </div>
        </div>
      </section>


      <section class="card pad col-span-6">
        <div class="kpi">
          <div>
            <div class="label">현재 소비 전력</div>
            <div class="value">${formatW(device.effectiveW)}</div>
          </div>
        </div>
        <div style="height: 10px"></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="toggle-power" ${locked ? "disabled" : ""}>
            ${device.isOn ? "전원 끄기" : "전원 켜기"}
          </button>
          <button class="btn" type="button" id="toggle-working" ${locked || !device.isOn ? "disabled" : ""}>
            ${device.isWorking ? "작업 종료" : "작업 시작"}
          </button>
          <button class="btn small" type="button" id="toggle-lock">
            ${locked ? "잠금 해제" : "잠금"}
          </button>
        </div>
        <div class="muted" style="margin-top: 10px; font-size: 12px;">
          - 잠금 상태에서는 전원/작업 토글이 비활성화됩니다.<br/>
          - 작업 버튼은 전원이 ON일 때만 활성화됩니다.
        </div>
      </section>


      <section class="card pad col-span-6">
        <div class="h1">메모</div>
        <div class="muted">기기에 대한 메모를 남길 수 있어요.</div>
        <div style="height: 12px"></div>
        <div class="note-with-saved">
          <form class="note" data-note-form data-device-id="${escapeHtml(device.id)}">
            <input
              type="text"
              inputmode="text"
              placeholder="메모"
              value="${note}"
              aria-label="기기 메모"
            />
            <button class="btn" type="submit">저장</button>
            <span class="muted" data-saved style="min-width: 46px;"></span>
          </form>
          ${note ? `<div class="saved-memo">메모: ${note}</div>` : ""}
        </div>
      </section>
    </div>
  `);


  document.getElementById("back")?.addEventListener("click", () => {
    location.hash = `#/classroom/${encodeURIComponent(b.id)}/${encodeURIComponent(classroom.id)}`;
  });


  document.getElementById("toggle-lock")?.addEventListener("click", () => {
    setLocked(b.id, classroom.id, baseDevice.id, !locked);
    render();
  });


  document.getElementById("toggle-power")?.addEventListener("click", () => {
    if (locked) return;
    const nextOn = !device.isOn;
    saveDeviceState(b.id, classroom.id, baseDevice.id, {
      isOn: nextOn,
      isWorking: nextOn ? true : false,
    });
    render();
  });


  document.getElementById("toggle-working")?.addEventListener("click", () => {
    if (locked) return;
    if (!device.isOn) return;
    saveDeviceState(b.id, classroom.id, baseDevice.id, {
      isWorking: !device.isWorking,
    });
    render();
  });


  mountInteractions({ buildingId: b.id, classroomId: classroom.id });
}


function renderClassroomDetail(buildingId, classroomId) {
  const b = getBuilding(decodeURIComponent(buildingId ?? "")) ?? null;
  const classroom = b?.classrooms.find((c) => c.id === decodeURIComponent(classroomId ?? "")) ?? null;
  if (!classroom) {
    setView(`
      <section class="card pad">
        <div class="h1">강의실을 찾을 수 없어요</div>
        <div class="muted">목록으로 돌아가서 다시 선택해 주세요.</div>
        <div style="height: 12px"></div>
        <button class="btn primary" type="button" id="go-home">강의실 목록으로</button>
      </section>
    `);
    document.getElementById("go-home")?.addEventListener("click", () => {
      location.hash = `#/classrooms/${encodeURIComponent(defaultBuildingId())}`;
    });
    return;
  }


  const activeDevices = classroom.devices
    .map((d) => effectiveDevice(b.id, classroom.id, d))
    .filter((d) => d.isOn && d.effectiveW > 0);
  const totalW = classroomTotalW({ ...classroom, _buildingId: b.id });
  const bid = b?.id ?? defaultBuildingId();


  setView(`
    <div class="grid">
      <section class="card pad col-span-12">
        <div class="toolbar">
          <div>
            <div class="h1">${escapeHtml(classroom.name)}</div>
            <div class="muted">${escapeHtml(b?.name ?? "")} · ${escapeHtml(String(classroom.floor))}층 · 현재 소비 전력 ${formatW(totalW)}</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button class="btn ghost" type="button" id="back">← 목록</button>
            <span class="badge" title="현재 전력을 소모 중인 기기 수">
              <span class="dot" aria-hidden="true"></span>
              <span>활성 ${activeDevices.length}개</span>
            </span>
          </div>
        </div>
      </section>


      <section class="card pad col-span-12">
        <div class="h1">전력 소모 중인 제품</div>
        <div class="muted">각 제품에 메모/잠금을 설정할 수 있고, 차단 기능은 알고리즘 연결로 확장 예정입니다.</div>
        <div style="height: 12px"></div>


        ${
          activeDevices.length === 0
            ? `<div class="muted">현재 전력 소모 중인 제품이 없습니다.</div>`
            : `<div class="list">
                ${activeDevices
                  .map((d) => {
                    const note = escapeHtml(getNote(classroom.id, d.id));
                    const locked = isLocked(bid, classroom.id, d.id);
                    return `
                      <div class="row">
                        <div>
                          <div class="title">${escapeHtml(d.name)}</div>
                          <div class="sub">기기 ID: ${escapeHtml(d.id)}</div>
                        </div>
                        <div class="badge" title="현재 소비 전력">
                          <span class="dot" aria-hidden="true"></span>
                          <span>${formatW(d.effectiveW)}</span>
                        </div>
                        <div class="note-with-saved">
                          <form class="note" data-note-form data-device-id="${escapeHtml(d.id)}">
                            <input
                              type="text"
                              inputmode="text"
                              placeholder="메모(예: 수업 끝나면 차단)"
                              value="${note}"
                              aria-label="${escapeHtml(d.name)} 메모"
                            />
                            <button class="btn" type="submit">저장</button>
                            <span class="muted" data-saved style="min-width: 46px;"></span>
                          </form>
                          ${note ? `<div class="saved-memo">메모: ${note}</div>` : ""}
                        </div>
                        <div style="display:flex; gap:10px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
                          ${
                            locked
                              ? `<span class="badge lock-badge" title="잠금 상태"><span class="dot" aria-hidden="true"></span><span>잠금</span></span>`
                              : ``
                          }
                          <button class="btn small" type="button" data-device-open data-device-id="${escapeHtml(d.id)}">
                            상세
                          </button>
                          <button class="btn small" type="button" data-lock-btn data-device-id="${escapeHtml(d.id)}">
                            ${locked ? "잠금 해제" : "잠금"}
                          </button>
                          <button
                            class="btn danger"
                            type="button"
                            ${locked ? "disabled" : ""}
                            data-block-btn
                            data-device-id="${escapeHtml(d.id)}"
                            title="${locked ? "잠금된 기기입니다(해제 후 차단 가능)" : "데모: 전원을 끄고 작업을 종료합니다"}"
                          >
                            차단
                          </button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>`
        }
      </section>
    </div>
  `);


  document.getElementById("back")?.addEventListener("click", () => {
    location.hash = `#/classrooms/${encodeURIComponent(b?.id ?? defaultBuildingId())}/${encodeURIComponent(String(classroom.floor))}`;
  });
  mountInteractions({ buildingId: bid, classroomId: classroom.id });


  for (const openBtn of Array.from(document.querySelectorAll("[data-device-open]"))) {
    openBtn.addEventListener("click", () => {
      const did = openBtn.getAttribute("data-device-id");
      if (!did) return;
      location.hash = `#/device/${encodeURIComponent(bid)}/${encodeURIComponent(classroom.id)}/${encodeURIComponent(did)}`;
    });
  }

  for (const blockBtn of Array.from(document.querySelectorAll("[data-block-btn]"))) {
    blockBtn.addEventListener("click", () => {
      const did = blockBtn.getAttribute("data-device-id");
      if (!did) return;
      if (isLocked(bid, classroom.id, did)) return;


      const ok = confirm("이 기기를 차단(전원 OFF)하시겠습니까?");
      if (!ok) return;


      saveDeviceState(bid, classroom.id, did, { isOn: false, isWorking: false });
      render();
    });
  }
}


function renderNotFound() {
  setView(`
    <section class="card pad">
      <div class="h1">페이지를 찾을 수 없어요</div>
      <div class="muted">전력 대시보드로 이동합니다.</div>
    </section>
  `);
  setTimeout(() => {
    location.hash = "#/";
  }, 600);
}


function render() {
  const route = parseRoute();
  if (route.name === "home") return renderHome();
  if (route.name === "classrooms") return renderClassroomsPage(route.buildingId ?? defaultBuildingId(), route.floorId);
  if (route.name === "classroom") return renderClassroomDetail(route.buildingId, route.classroomId);
  if (route.name === "device") return renderDeviceDetail(route.buildingId, route.classroomId, route.deviceId);
  if (route.name === "classroom-legacy") {
    const found = findClassroomLegacy(decodeURIComponent(route.id));
    if (!found) return renderNotFound();
    return renderClassroomDetail(found.building.id, found.classroom.id);
  }
  if (route.name === "community") return renderCommunity();
  return renderNotFound();
}

document.addEventListener('click', async (e) => {
    const text = e.target.innerText || "";

    if (text.includes("차단")) {
        if (confirm("ESP32: 실제로 전력을 차단하시겠습니까?")) {
            try {
                await fetch(`${ESP32_HTTP_BASE}/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ power: 'OFF' })
                });
                alert("차단 신호를 보냈습니다.");
            } catch(err) { alert("연결 실패! IP를 확인하세요."); }
        }
    }

    if (text.includes("연결") || text.includes("ON")) {
        fetch(`${ESP32_HTTP_BASE}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power: 'ON' })
        }).catch(e => console.log("ESP32 OFF"));
    }
});


window.addEventListener("hashchange", render);
render();
