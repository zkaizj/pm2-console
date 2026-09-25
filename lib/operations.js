"use strict";

function isAttentionRequired(service, now = Date.now()) {
  if (service.ignoreUntil && Date.parse(service.ignoreUntil) > now) return false;
  if (service.health && service.health.ok === false) return true;
  if (service.status === "errored") return true;
  return service.desiredState === "running" && service.status !== "online";
}

function shouldAlertHealth(previous, health) {
  return !health.ok && (!previous || previous.ok);
}

function canCompleteHandoff(verification) {
  return Boolean(verification && verification.online && (!verification.health || verification.health.ok));
}

module.exports = { isAttentionRequired, shouldAlertHealth, canCompleteHandoff };
