// Plain language helpers.
//
// Raw enum values and ISO timestamps never reach the page: both identify a
// document as machine output to a lay reader.

const ACTIONS = {
  collected: "collected from the source device",
  sealed: "fingerprint confirmed by the server",
  transferred: "transferred to the evidence store",
  accessed: "opened for review",
  analysed: "examined",
  returned: "returned to the evidence store",
  exported: "a copy was released",
  correction: "a correction was recorded",
};

export function plainAction(action) {
  return ACTIONS[action] ?? action.replace(/_/g, " ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Apr 2026, 11:20" rather than an ISO string. */
export function formatPlain(value) {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  // Padded so the custody list aligns as a column.
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "14 Apr 2026" for prose, with no time. */
export function formatDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "11:20" */
export function formatTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatNumber(n) {
  return n.toLocaleString("en-GB");
}

/**
 * States the gap between device and server clocks explicitly. A device clock
 * is not independently verifiable and is never presented as authoritative.
 */
export function offlineGapSentence(deviceTime, serverTime) {
  const gapMs = new Date(serverTime) - new Date(deviceTime);
  if (gapMs < 60 * 1000) return null;
  const hours = Math.floor(gapMs / 3600000);
  const mins = Math.round((gapMs % 3600000) / 60000);
  const span = hours > 0
    ? `${hours} hour${hours === 1 ? "" : "s"}${mins ? ` and ${mins} minutes` : ""}`
    : `${mins} minutes`;
  return `Recorded on the officer's device at ${formatTime(deviceTime)} on ${formatDay(deviceTime)}, ` +
         `when the device had no network. Confirmed by the server ${span} later, at ` +
         `${formatTime(serverTime)}, once the connection was restored. Both times are shown ` +
         `because the device clock is set by the device and is not independently verified.`;
}
