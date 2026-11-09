/**
 * Clip length for cloud video models.
 *
 * A batch item's `durationSeconds` is the length the shot needs; the role's
 * `params.duration` in config/models.yaml is only the fallback. Models take
 * whole seconds, often with a minimum or a fixed set of lengths, which the
 * adapter-only params `min_duration` and `durations` describe. Both are
 * stripped from the request body.
 */
export function clipDurationSeconds(
  requested: number | undefined,
  params: Record<string, unknown> | undefined,
): number {
  const fallback = Number(params?.duration ?? 5);
  let seconds = requested !== undefined && requested > 0 ? Math.ceil(requested - 1e-6) : fallback;
  const minimum = Number(params?.min_duration);
  if (Number.isFinite(minimum) && seconds < minimum) seconds = minimum;
  const allowed = Array.isArray(params?.durations)
    ? params.durations.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
    : [];
  if (allowed.length > 0) return allowed.find((value) => value >= seconds) ?? allowed[allowed.length - 1]!;
  return seconds;
}

/** Remove the adapter-only duration options from a request body. */
export function withoutDurationOptions(params: Record<string, unknown>): Record<string, unknown> {
  const { min_duration: _minimum, durations: _durations, ...rest } = params;
  return rest;
}
