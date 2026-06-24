const STORAGE_KEY = "battery-mic-tracker:v2";

const devices = {
  shure: {
    name: "Shure без провода",
    maxUses: 3,
  },
  headset: {
    name: "Sennheiser пастора",
    maxUses: 2,
  },
};

const today = new Date().toISOString();

const defaultDeviceState = {
  usageCount: 0,
  lastUsed: null,
  replacedAt: today,
};

function loadState() {
  const initialState = Object.fromEntries(
    Object.keys(devices).map((deviceId) => [deviceId, { ...defaultDeviceState }]),
  );
  const saved = readSavedState();

  if (!saved) {
    return initialState;
  }

  try {
    const parsed = JSON.parse(saved);

    return Object.fromEntries(
      Object.keys(devices).map((deviceId) => [
        deviceId,
        {
          ...defaultDeviceState,
          ...parsed[deviceId],
        },
      ]),
    );
  } catch {
    return initialState;
  }
}

function readSavedState() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveState(nextState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Private browsing or restricted file access can block localStorage.
  }
}

function formatDate(value) {
  if (!value) {
    return "ещё не отмечено";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getChargePercent(usageCount, maxUses) {
  if (usageCount <= 0) {
    return 100;
  }

  return Math.max(0, Math.round(((maxUses - usageCount) / maxUses) * 100));
}

function getBatteryColor(percent) {
  if (percent > 50) {
    return "var(--green)";
  }

  if (percent > 20) {
    return "var(--yellow)";
  }

  return "var(--red)";
}

function getHint(usageCount, maxUses) {
  if (usageCount === 0) {
    return "Батарейки свежие.";
  }

  if (usageCount < maxUses - 1) {
    return "Остался запас ещё примерно на одно воскресенье.";
  }

  if (usageCount === maxUses - 1) {
    return "Это последнее надёжное использование. Лучше подготовить замену.";
  }

  return "Заряд закончился. Использование больше не отмечаем до замены.";
}

function getElements(card) {
  return {
    usageCount: card.querySelector('[data-role="usage-count"]'),
    batteryLevel: card.querySelector('[data-role="battery-level"]'),
    chargeValue: card.querySelector('[data-role="charge-value"]'),
    chargeHint: card.querySelector('[data-role="charge-hint"]'),
    emptyState: card.querySelector('[data-role="empty-state"]'),
    lastUsed: card.querySelector('[data-role="last-used"]'),
    replacedAt: card.querySelector('[data-role="replaced-at"]'),
    useButton: card.querySelector('[data-action="use"]'),
  };
}

function renderDevice(deviceId) {
  const card = document.querySelector(`[data-device-id="${deviceId}"]`);
  const elements = getElements(card);
  const deviceState = state[deviceId];
  const maxUses = devices[deviceId].maxUses;
  const isEmpty = deviceState.usageCount >= maxUses;
  const percent = getChargePercent(deviceState.usageCount, maxUses);

  card.classList.toggle("is-empty", isEmpty);
  elements.usageCount.textContent = deviceState.usageCount;
  elements.chargeValue.textContent = `${percent}%`;
  elements.chargeHint.textContent = getHint(deviceState.usageCount, maxUses);
  elements.lastUsed.textContent = formatDate(deviceState.lastUsed);
  elements.replacedAt.textContent = formatDate(deviceState.replacedAt);
  elements.batteryLevel.style.width = `${percent}%`;
  elements.batteryLevel.style.backgroundColor = getBatteryColor(percent);
  elements.emptyState.hidden = !isEmpty;
  elements.useButton.disabled = isEmpty;
  elements.useButton.textContent = isEmpty ? "Сначала замените батарейки" : "Использовали сегодня";
}

function render() {
  Object.keys(devices).forEach(renderDevice);
}

function updateDevice(deviceId, nextDeviceState) {
  state = {
    ...state,
    [deviceId]: {
      ...state[deviceId],
      ...nextDeviceState,
    },
  };

  saveState(state);
  renderDevice(deviceId);
}

function useDevice(deviceId) {
  if (state[deviceId].usageCount >= devices[deviceId].maxUses) {
    return;
  }

  updateDevice(deviceId, {
    usageCount: state[deviceId].usageCount + 1,
    lastUsed: new Date().toISOString(),
  });
}

function replaceBatteries(deviceId) {
  const confirmed = window.confirm(`Сбросить счётчик и отметить замену батареек для ${devices[deviceId].name}?`);

  if (!confirmed) {
    return;
  }

  updateDevice(deviceId, {
    usageCount: 0,
    lastUsed: null,
    replacedAt: new Date().toISOString(),
  });
}

function bindDeviceControls(card) {
  const deviceId = card.dataset.deviceId;

  card.querySelector('[data-action="use"]').addEventListener("click", () => {
    useDevice(deviceId);
  });

  card.querySelector('[data-action="replace"]').addEventListener("click", () => {
    replaceBatteries(deviceId);
  });
}

let state = loadState();

document.querySelectorAll("[data-device-id]").forEach((card) => {
  bindDeviceControls(card);
});

render();
