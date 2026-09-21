/**
 * The one thing this release takes away, isolated because it breaks the
 * program it sits in: `SpeedProfile` is an intersection now, so declaration
 * merging into it is a duplicate identifier reported against
 * `config/types.ts` itself.
 *
 * This file MUST NOT compile. It is excluded from every tsconfig and checked
 * on its own, so the day it starts compiling is the day the note in the
 * changeset is wrong.
 */
declare module '../../src/config/types.js' {
  interface SpeedProfile {
    readonly mergedIn: string;
  }
}
export {};
