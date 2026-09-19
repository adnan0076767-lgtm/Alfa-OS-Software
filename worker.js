/*
 ALFA OS SOFTWARE
 V1.5 CORE WORKER
 Background Task Engine
*/

"use strict";

const runningTasks = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function send(taskId, type, data = {}) {
  self.postMessage({
    taskId,
    type,
    timestamp: Date.now(),
    ...data
  });
}

async function runTask(task) {

  const {
    id,
    name,
    duration = 8000
  } = task;

  runningTasks.set(id, {
    paused: false,
    cancelled: false
  });

  send(id, "started", {
    name
  });

  const steps = 20;

  for (let i = 1; i <= steps; i++) {

    const state = runningTasks.get(id);

    if (!state) {
      send(id, "cancelled");
      return;
    }

    if (state.cancelled) {
      runningTasks.delete(id);

      send(id, "cancelled");

      return;
    }

    while (state.paused) {

      await sleep(250);

      const current = runningTasks.get(id);

      if (!current || current.cancelled) {

        runningTasks.delete(id);

        send(id, "cancelled");

        return;
      }
    }

    await sleep(Math.max(100, duration / steps));

    const progress =
      Math.round((i / steps) * 100);

    send(id, "progress", {
      name,
      progress,
      message:
        "Processing " +
        name +
        " · " +
        progress +
        "%"
    });
  }

  runningTasks.delete(id);

  send(id, "completed", {
    name,
    result: {
      status: "completed",
      engine: "ALFA OS CORE",
      safeMode: true
    }
  });
}


self.onmessage = event => {

  const message = event.data || {};

  const {
    action,
    task
  } = message;

  if (action === "start") {

    runTask(task)
      .catch(error => {

        send(
          task.id,
          "error",
          {
            error: error.message
          }
        );

      });

    return;
  }


  if (action === "pause") {

    const state =
      runningTasks.get(task.id);

    if (state) {
      state.paused = true;

      send(
        task.id,
        "paused"
      );
    }

    return;
  }


  if (action === "resume") {

    const state =
      runningTasks.get(task.id);

    if (state) {
      state.paused = false;

      send(
        task.id,
        "resumed"
      );
    }

    return;
  }


  if (action === "cancel") {

    const state =
      runningTasks.get(task.id);

    if (state) {
      state.cancelled = true;
    }

    return;
  }
};
