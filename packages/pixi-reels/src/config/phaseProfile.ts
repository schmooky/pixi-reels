import type { PhaseSection, PhaseTiming, SpeedProfile, StepTiming } from './types.js';

/** What a lookup by runtime phase name can find on a profile. */
export type AnyPhaseSection = PhaseSection<Record<string, StepTiming>>;

/** A section's contents without the `whenAnticipated` half. */
type SectionBody = Omit<AnyPhaseSection, 'whenAnticipated'>;

/** One step's configuration as a profile may write it: one segment or several. */
type StepEntry = StepTiming | readonly StepTiming[];

const NO_STEPS: readonly StepTiming[] = [];

// An array is an object too, and spreading one into a profile would land
// its indices there as `'0'`, `'1'`. A section is a plain object or nothing.
const isSection = (value: unknown): value is AnyPhaseSection =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `Array.isArray` does not narrow a `readonly` array out of a union on its own. */
const isSegmentList = (value: StepEntry): value is readonly StepTiming[] => Array.isArray(value);

/** One step's segments, in order. A single object is the one-segment form of the same thing. */
const segmentsOf = (entry: StepEntry | undefined): readonly StepTiming[] =>
  entry === undefined ? NO_STEPS : isSegmentList(entry) ? entry : [entry];

/**
 * `value` without the keys whose value is `undefined`, so spreading a section
 * over a profile cannot blank a field the profile did set. Writing
 * `bounceDistance: undefined` in a section means "say nothing", not "none".
 */
function defined<T extends object>(value: T): Partial<T> {
  // `Object.fromEntries` is typed `Record<string, any>`; the entries come
  // straight back off `value`, so the shape is `Partial<T>` by construction.
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * The section `profile` carries for `phase`, or `undefined`. The lookup is by
 * a runtime name, so it reads the property through `Reflect.get` and checks
 * the shape rather than indexing the typed profile.
 */
function sectionOf(profile: SpeedProfile, phase: string): AnyPhaseSection | undefined {
  const value: unknown = Reflect.get(profile, phase);
  return isSection(value) ? value : undefined;
}

/** The flat timing fields of a section, without `steps` / `whenAnticipated`. */
function timingOf(section: Partial<AnyPhaseSection> | undefined): Partial<PhaseTiming> {
  if (!section) return {};
  const { steps: _steps, whenAnticipated: _whenAnticipated, ...timing } = section;
  return defined(timing);
}

/** `override`'s segments merged over `base`'s, segment by segment. */
function mergeStepEntry(base: StepEntry | undefined, override: StepEntry | undefined): StepEntry {
  if (base === undefined) return override ?? NO_STEPS;
  if (override === undefined) return base;
  const merged = mergeSegments(segmentsOf(base), segmentsOf(override));
  return merged.length === 1 ? merged[0] : merged;
}

/** `override`'s segments merged over `base`'s, positionally. */
function mergeSegments(
  base: readonly StepTiming[],
  override: readonly StepTiming[],
): readonly StepTiming[] {
  if (override.length === 0) return base;
  if (base.length === 0) return override;
  const merged: StepTiming[] = [];
  for (let i = 0; i < Math.max(base.length, override.length); i++) {
    merged.push({ ...base[i], ...defined(override[i] ?? {}) });
  }
  return merged;
}

/** `override` merged over `base`: flat fields replace, steps merge segment by segment. */
function mergeBody(base: SectionBody | undefined, override: SectionBody | undefined): SectionBody {
  if (!base) return override ?? {};
  if (!override) return base;
  const steps: Record<string, StepEntry | undefined> = { ...base.steps };
  for (const name of Object.keys(override.steps ?? {})) {
    steps[name] = mergeStepEntry(base.steps?.[name], override.steps?.[name]);
  }
  return { ...timingOf(base), ...timingOf(override), steps };
}

/**
 * `override` merged over `base`, both halves of the section included: flat
 * fields replace, per-step config merges segment by segment, and
 * `whenAnticipated` merges the same way.
 *
 * What a runtime tune (`speed.tune(...)`) is folded in with, so naming one
 * step's ease leaves the rest of the section standing.
 */
export function mergeSection(
  base: AnyPhaseSection | undefined,
  override: AnyPhaseSection | undefined,
): AnyPhaseSection {
  const body = mergeBody(base, override);
  const whenAnticipated =
    base?.whenAnticipated || override?.whenAnticipated
      ? mergeBody(base?.whenAnticipated, override?.whenAnticipated)
      : undefined;
  return whenAnticipated ? { ...body, whenAnticipated } : body;
}

/**
 * `profile` with every tune in `tunes` merged into its own section for that
 * phase. What {@link SpeedManager.active} hands out once a game has tuned
 * something at run time.
 */
export function tuneProfile<TProfile extends SpeedProfile>(
  profile: TProfile,
  tunes: ReadonlyMap<string, AnyPhaseSection>,
): TProfile {
  if (tunes.size === 0) return profile;
  const tuned = { ...profile };
  for (const [phase, section] of tunes) {
    Object.assign(tuned, { [phase]: mergeSection(sectionOf(profile, phase), section) });
  }
  return tuned;
}

/**
 * The profile a phase runs on, with its own section folded into the flat
 * fields: the profile first, then `profile[phase]`, then that section's
 * `whenAnticipated` when the reel teased earlier in this spin.
 *
 * A profile with no section for `phase` is returned as it is, so a phase that
 * has always read `profile.spinSpeed` reads exactly what it always did.
 */
export function resolvePhaseProfile<TProfile extends SpeedProfile>(
  profile: TProfile,
  phase: string,
  anticipated = false,
): TProfile {
  const section = sectionOf(profile, phase);
  if (!section) return profile;
  const variant = anticipated ? section.whenAnticipated : undefined;
  return { ...profile, ...timingOf(section), ...timingOf(variant) };
}

/**
 * What the profile says about one named step of one phase, in segment order.
 * The section's `whenAnticipated` entry for that step is merged over the
 * section's own, segment by segment.
 *
 * Empty when the profile configures nothing for that step. The built-in steps
 * read the first entry; a list is for a step written to consume segments.
 */
export function resolveStepTiming(
  profile: SpeedProfile,
  phase: string,
  stepName: string,
  anticipated = false,
): readonly StepTiming[] {
  const section = sectionOf(profile, phase);
  if (!section) return NO_STEPS;
  const base = segmentsOf(section.steps?.[stepName]);
  if (!anticipated) return base;
  return mergeSegments(base, segmentsOf(section.whenAnticipated?.steps?.[stepName]));
}

/**
 * Every step name the profile configures for `phase`, from both halves of
 * the section. What a phase checks its own step list against, so a name that
 * matches nothing is reported rather than silently ignored.
 */
export function configuredStepNames(profile: SpeedProfile, phase: string): readonly string[] {
  const section = sectionOf(profile, phase);
  if (!section) return [];
  const names = new Set([
    ...Object.keys(section.steps ?? {}),
    ...Object.keys(section.whenAnticipated?.steps ?? {}),
  ]);
  return [...names];
}
