export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data, error: null });
export const created = (res, data) => ok(res, data, 201);
export const fail = (res, status, code, message, details) =>
  res.status(status).json({ success: false, data: null, error: { code, message, ...(details ? { details } : {}) } });
