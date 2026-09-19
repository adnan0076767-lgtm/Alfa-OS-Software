/*
 ALFA OS SOFTWARE
 V1.5 CORE ENGINE
 Task Manager + IndexedDB + Worker Controller
*/

"use strict";

const ALFA_CORE_VERSION = "V1.5";

const ALFA_DB_NAME = "ALFA_OS_DATABASE";
const ALFA_DB_VERSION = 1;

let alfaDB = null;

let worker = null;

const tasks = new Map();

let taskSequence = 0;


/* =====================================================
   DATABASE
===================================================== */

function openDatabase() {

  return new Promise((resolve, reject) => {

    const request =
      indexedDB.open(
        ALFA_DB_NAME,
        ALFA_DB_VERSION
      );

    request.onupgradeneeded = event => {

      const db =
        event.target.result;

      if (!db.objectStoreNames.contains("tasks")) {

        db.createObjectStore(
          "tasks",
          {
            keyPath: "id"
          }
        );
      }


      if (!db.objectStoreNames.contains("findings")) {

        db.createObjectStore(
          "findings",
          {
            keyPath: "id"
          }
        );
      }


      if (!db.objectStoreNames.contains("events")) {

        db.createObjectStore(
          "events",
          {
            keyPath: "id",
            autoIncrement: true
          }
        );
      }

    };


    request.onsuccess = event => {

      alfaDB =
        event.target.result;

      resolve(alfaDB);

    };


    request.onerror = () => {

      reject(
        request.error
      );

    };

  });

}


/* =====================================================
   DATABASE SAVE
===================================================== */

function saveTask(task) {

  if (!alfaDB) return;

  const transaction =
    alfaDB.transaction(
      "tasks",
      "readwrite"
    );

  transaction
    .objectStore("tasks")
    .put(task);
}


function saveEvent(eventData) {

  if (!alfaDB) return;

  const transaction =
    alfaDB.transaction(
      "events",
      "readwrite"
    );

  transaction
    .objectStore("events")
    .add({
      ...eventData,
      createdAt: Date.now()
    });
}


/* =====================================================
   WORKER
===================================================== */

function createWorker() {

  worker =
    new Worker("worker.js");

  worker.onmessage =
    handleWorkerMessage;

  worker.onerror = error => {

    addCoreLog(
      "Worker error: " +
      error.message,
      "danger"
    );

  };

}


/* =====================================================
   WORKER MESSAGE
===================================================== */

function handleWorkerMessage(event) {

  const data =
    event.data || {};

  const task =
    tasks.get(data.taskId);

  if (!task) return;


  if (data.type === "started") {

    task.status = "RUNNING";
    task.progress = 0;

    saveTask(task);

    renderTask(task);

    addCoreLog(
      "TASK STARTED → " +
      task.name,
      "info"
    );

    saveEvent({
      type: "TASK_STARTED",
      taskId: task.id
    });

  }


  if (data.type === "progress") {

    task.status = "RUNNING";

    task.progress =
      data.progress || 0;

    task.message =
      data.message || "";

    saveTask(task);

    renderTask(task);

  }


  if (data.type === "paused") {

    task.status = "PAUSED";

    saveTask(task);

    renderTask(task);

    addCoreLog(
      "TASK PAUSED → " +
      task.name,
      "warn"
    );

  }


  if (data.type === "resumed") {

    task.status = "RUNNING";

    saveTask(task);

    renderTask(task);

    addCoreLog(
      "TASK RESUMED → " +
      task.name,
      "info"
    );

  }


  if (data.type === "cancelled") {

    task.status = "CANCELLED";

    task.progress = 0;

    saveTask(task);

    renderTask(task);

    addCoreLog(
      "TASK CANCELLED → " +
      task.name,
      "warn"
    );

  }


  if (data.type === "completed") {

    task.status = "COMPLETED";

    task.progress = 100;

    task.result =
      data.result || {};

    saveTask(task);

    renderTask(task);

    addCoreLog(
      "TASK COMPLETED → " +
      task.name,
      "ok"
    );

    saveEvent({
      type: "TASK_COMPLETED",
      taskId: task.id
    });

  }


  if (data.type === "error") {

    task.status = "ERROR";

    task.error =
      data.error;

    saveTask(task);

    renderTask(task);

    addCoreLog(
      "TASK ERROR → " +
      task.name,
      "danger"
    );

  }

}


/* =====================================================
   TASK CREATION
===================================================== */

function createTask(
  name,
  duration = 8000
) {

  taskSequence++;

  const id =
    "TASK-" +
    String(
      Date.now()
    ).slice(-6) +
    "-" +
    taskSequence;


  const task = {

    id,

    name,

    status: "QUEUED",

    progress: 0,

    duration,

    createdAt: Date.now(),

    message:
      "Waiting for worker..."

  };


  tasks.set(
    id,
    task
  );

  saveTask(task);

  renderTask(task);

  addCoreLog(
    "TASK CREATED → " +
    name,
    "info"
  );

  return task;
}


/* =====================================================
   TASK CONTROLS
===================================================== */

function startTask(id) {

  const task =
    tasks.get(id);

  if (!task) return;

  task.status = "STARTING";

  saveTask(task);

  renderTask(task);

  worker.postMessage({

    action: "start",

    task: {

      id: task.id,

      name: task.name,

      duration:
        task.duration

    }

  });

}


function pauseTask(id) {

  const task =
    tasks.get(id);

  if (!task) return;

  worker.postMessage({

    action: "pause",

    task: {
      id
    }

  });

}


function resumeTask(id) {

  const task =
    tasks.get(id);

  if (!task) return;

  worker.postMessage({

    action: "resume",

    task: {
      id
    }

  });

}


function cancelTask(id) {

  const task =
    tasks.get(id);

  if (!task) return;

  worker.postMessage({

    action: "cancel",

    task: {
      id
    }

  });

}


/* =====================================================
   TASK BUTTON
===================================================== */

function controlTask(
  id,
  action
) {

  if (action === "start") {
    startTask(id);
  }

  if (action === "pause") {
    pauseTask(id);
  }

  if (action === "resume") {
    resumeTask(id);
  }

  if (action === "cancel") {
    cancelTask(id);
  }

}


/* =====================================================
   UI INJECTION
===================================================== */

function injectCoreUI() {

  const style =
    document.createElement("style");

  style.textContent = `

  #alfaCorePanel{
    margin-top:18px;
    border:1px solid rgba(0,229,255,.16);
    border-radius:15px;
    background:rgba(7,13,27,.9);
    overflow:hidden;
    box-shadow:0 0 30px rgba(0,229,255,.06);
  }

  #alfaCoreHeader{
    display:flex;
    justify-content:space-between;
    align-items:center;
    padding:16px 18px;
    border-bottom:1px solid rgba(0,229,255,.12);
  }

  .alfaCoreTitle{
    font-size:11px;
    letter-spacing:1.7px;
    color:#d9f7ff;
  }

  .alfaCoreTitle b{
    color:#00e5ff;
  }

  #alfaTaskControls{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    padding:15px 18px;
    border-bottom:1px solid rgba(0,229,255,.08);
  }

  .alfaCoreBtn{
    border:1px solid rgba(0,229,255,.25);
    background:rgba(0,229,255,.05);
    color:#00e5ff;
    padding:9px 11px;
    border-radius:8px;
    cursor:pointer;
    font-size:10px;
    font-weight:bold;
  }

  .alfaCoreBtn:hover{
    background:#00e5ff;
    color:#001016;
  }

  #alfaTaskList{
    padding:12px 18px;
    display:flex;
    flex-direction:column;
    gap:8px;
  }

  .alfaTask{
    border:1px solid rgba(255,255,255,.06);
    background:rgba(255,255,255,.018);
    border-radius:10px;
    padding:11px;
  }

  .alfaTaskTop{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
  }

  .alfaTaskName{
    font-size:11px;
    color:#d9f7ff;
  }

  .alfaTaskStatus{
    font-size:8px;
    letter-spacing:1px;
    padding:4px 7px;
    border-radius:5px;
    background:rgba(0,229,255,.06);
    color:#00e5ff;
  }

  .alfaTaskProgress{
    margin-top:9px;
    height:4px;
    border-radius:5px;
    background:#101b2c;
    overflow:hidden;
  }

  .alfaTaskProgress i{
    display:block;
    height:100%;
    width:0%;
    background:#00e5ff;
    box-shadow:0 0 10px rgba(0,229,255,.6);
    transition:width .2s;
  }

  .alfaTaskBottom{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:8px;
    margin-top:8px;
  }

  .alfaTaskMessage{
    color:#60758c;
    font-size:9px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }

  .alfaTaskActions{
    display:flex;
    gap:5px;
  }

  .alfaMiniBtn{
    border:1px solid rgba(255,255,255,.08);
    background:#08111e;
    color:#88a0b8;
    border-radius:5px;
    padding:5px 7px;
    font-size:8px;
    cursor:pointer;
  }

  .alfaMiniBtn:hover{
    color:#00e5ff;
    border-color:#00e5ff;
  }

  #alfaCoreStats{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:8px;
    padding:0 18px 15px;
  }

  .alfaCoreStat{
    padding:10px;
    border:1px solid rgba(255,255,255,.05);
    border-radius:8px;
    text-align:center;
  }

  .alfaCoreStat strong{
    display:block;
    font-size:17px;
    color:#00e5ff;
  }

  .alfaCoreStat span{
    display:block;
    margin-top:3px;
    font-size:7px;
    color:#5e7389;
    letter-spacing:1px;
  }

  @media(max-width:600px){

    #alfaCoreStats{
      grid-template-columns:repeat(2,1fr);
    }

    .alfaTaskTop,
    .alfaTaskBottom{
      align-items:flex-start;
      flex-direction:column;
    }

    .alfaTaskActions{
      width:100%;
    }

    .alfaMiniBtn{
      flex:1;
    }

  }

  `;

  document.head.appendChild(style);


  const panel =
    document.createElement("section");

  panel.id =
    "alfaCorePanel";


  panel.innerHTML = `

    <div id="alfaCoreHeader">

      <div class="alfaCoreTitle">
        ⚙️ <b>ALFA OS</b> CORE ENGINE
      </div>

      <div style="
        font-size:9px;
        color:#00ff9d;
        letter-spacing:1px;
      ">
        V1.5 ONLINE
      </div>

    </div>


    <div id="alfaTaskControls">

      <button
        class="alfaCoreBtn"
        onclick="createDemoTask('OSINT ENGINE')">
        + OSINT TASK
      </button>

      <button
        class="alfaCoreBtn"
        onclick="createDemoTask('SECURITY ENGINE')">
        + SECURITY TASK
      </button>

      <button
        class="alfaCoreBtn"
        onclick="createDemoTask('REPORT ENGINE')">
        + REPORT TASK
      </button>

      <button
        class="alfaCoreBtn"
        onclick="createDemoTask('AI SECURITY ENGINE')">
        + AI TASK
      </button>

    </div>


    <div id="alfaCoreStats">

      <div class="alfaCoreStat">
        <strong id="coreTotal">0</strong>
        <span>TOTAL TASK</span>
      </div>

      <div class="alfaCoreStat">
        <strong id="coreRunning">0</strong>
        <span>RUNNING</span>
      </div>

      <div class="alfaCoreStat">
        <strong id="coreCompleted">0</strong>
        <span>COMPLETED</span>
      </div>

      <div class="alfaCoreStat">
        <strong id="coreQueued">0</strong>
        <span>QUEUED</span>
      </div>

    </div>


    <div id="alfaTaskList"></div>

  `;


  const main =
    document.querySelector(".main") ||
    document.body;

  main.appendChild(panel);

}


/* =====================================================
   TASK RENDER
===================================================== */

function renderTask(task) {

  const list =
    document.getElementById(
      "alfaTaskList"
    );

  if (!list) return;


  let element =
    document.getElementById(
      "task-" + task.id
    );


  if (!element) {

    element =
      document.createElement("div");

    element.className =
      "alfaTask";

    element.id =
      "task-" + task.id;

    list.prepend(element);

  }


  let actionHTML = "";

  if (
    task.status === "QUEUED" ||
    task.status === "STARTING"
  ) {

    actionHTML += `
      <button
        class="alfaMiniBtn"
        onclick="controlTask('${task.id}','start')">
        ▶ START
      </button>
    `;

  }


  if (task.status === "RUNNING") {

    actionHTML += `
      <button
        class="alfaMiniBtn"
        onclick="controlTask('${task.id}','pause')">
        ⏸ PAUSE
      </button>
    `;

    actionHTML += `
      <button
        class="alfaMiniBtn"
        onclick="controlTask('${task.id}','cancel')">
        ✕ CANCEL
      </button>
    `;

  }


  if (task.status === "PAUSED") {

    actionHTML += `
      <button
        class="alfaMiniBtn"
        onclick="controlTask('${task.id}','resume')">
        ▶ RESUME
      </button>
    `;

    actionHTML += `
      <button
        class="alfaMiniBtn"
        onclick="controlTask('${task.id}','cancel')">
        ✕ CANCEL
      </button>
    `;

  }


  if (
    task.status === "COMPLETED" ||
    task.status === "CANCELLED" ||
    task.status === "ERROR"
  ) {

    actionHTML += `
      <button
        class="alfaMiniBtn"
        onclick="retryTask('${task.id}')">
        ↻ RETRY
      </button>
    `;

  }


  element.innerHTML = `

    <div class="alfaTaskTop">

      <div class="alfaTaskName">
        ${escapeHTML(task.name)}
      </div>

      <div class="alfaTaskStatus">
        ${escapeHTML(task.status)}
      </div>

    </div>


    <div class="alfaTaskProgress">
      <i style="
        width:${task.progress || 0}%
      "></i>
    </div>


    <div class="alfaTaskBottom">

      <div class="alfaTaskMessage">
        ${escapeHTML(
          task.message || "Ready"
        )}
      </div>

      <div class="alfaTaskActions">
        ${actionHTML}
      </div>

    </div>

  `;


  updateCoreStats();

}


/* =====================================================
   RETRY
===================================================== */

function retryTask(id) {

  const oldTask =
    tasks.get(id);

  if (!oldTask) return;


  const newTask =
    createTask(
      oldTask.name +
      " / RETRY",
      oldTask.duration
    );

  startTask(
    newTask.id
  );

}


/* =====================================================
   DEMO TASK
===================================================== */

function createDemoTask(name) {

  const task =
    createTask(
      name,
      5000 +
      Math.floor(
        Math.random() * 6000
      )
    );

  startTask(
    task.id
  );

}


/* =====================================================
   STATS
===================================================== */

function updateCoreStats() {

  let total = tasks.size;

  let running = 0;

  let completed = 0;

  let queued = 0;


  tasks.forEach(task => {

    if (
      task.status === "RUNNING" ||
      task.status === "STARTING"
    ) {
      running++;
    }

    if (
      task.status === "COMPLETED"
    ) {
      completed++;
    }

    if (
      task.status === "QUEUED"
    ) {
      queued++;
    }

  });


  const totalEl =
    document.getElementById(
      "coreTotal"
    );

  const runningEl =
    document.getElementById(
      "coreRunning"
    );

  const completedEl =
    document.getElementById(
      "coreCompleted"
    );

  const queuedEl =
    document.getElementById(
      "coreQueued"
    );


  if (totalEl)
    totalEl.textContent =
      total;

  if (runningEl)
    runningEl.textContent =
      running;

  if (completedEl)
    completedEl.textContent =
      completed;

  if (queuedEl)
    queuedEl.textContent =
      queued;

}


/* =====================================================
   SAFE HTML
===================================================== */

function escapeHTML(value) {

  return String(value)

    .replaceAll("&","&amp;")

    .replaceAll("<","&lt;")

    .replaceAll(">","&gt;")

    .replaceAll('"',"&quot;")

    .replaceAll("'","&#039;");
}


/* =====================================================
   LOGGING
===================================================== */

function addCoreLog(
  message,
  type = ""
) {

  console.log(
    "[ALFA OS CORE]",
    message
  );


  const terminal =
    document.getElementById(
      "terminal"
    );

  if (!terminal) return;


  const line =
    document.createElement(
      "div"
    );

  line.className =
    "termLine";


  const time =
    new Date()
      .toLocaleTimeString("id-ID");


  line.innerHTML = `

    <span class="time">
      [${time}]
    </span>

    <span class="${type}">
      ${escapeHTML(message)}
    </span>

  `;


  terminal.appendChild(
    line
  );

  terminal.scrollTop =
    terminal.scrollHeight;

}


/* =====================================================
   INITIALIZE
===================================================== */

async function initALFACore() {

  try {

    await openDatabase();

    createWorker();

    injectCoreUI();

    addCoreLog(
      "ALFA OS CORE ENGINE V1.5 initialized.",
      "ok"
    );

    addCoreLog(
      "IndexedDB local storage online.",
      "info"
    );

    addCoreLog(
      "Background Worker online.",
      "ok"
    );

    addCoreLog(
      "Multitasking engine ready.",
      "ok"
    );

  }

  catch(error) {

    console.error(
      "ALFA OS CORE ERROR:",
      error
    );

  }

}


/* =====================================================
   START
===================================================== */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initALFACore
  );

} else {

  initALFACore();

}
