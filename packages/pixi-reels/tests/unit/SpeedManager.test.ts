import { describe, it, expect } from 'vitest';
import { SpeedManager } from '../../src/speed/SpeedManager.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';

describe('SpeedManager', () => {
  function createManager() {
    const profiles = new Map([
      ['normal', SpeedPresets.NORMAL],
      ['turbo', SpeedPresets.TURBO],
      ['superTurbo', SpeedPresets.SUPER_TURBO],
    ]);
    return new SpeedManager(profiles, 'normal');
  }

  it('initializes with correct profile', () => {
    const mgr = createManager();
    expect(mgr.activeName).toBe('normal');
    expect(mgr.active.spinSpeed).toBe(30);
  });

  it('switches speed profiles', () => {
    const mgr = createManager();
    const { previous, current } = mgr.set('turbo');
    expect(previous.name).toBe('normal');
    expect(current.name).toBe('turbo');
    expect(mgr.activeName).toBe('turbo');
    expect(mgr.active.spinSpeed).toBe(50);
  });

  it('throws on unknown initial speed', () => {
    const profiles = new Map([['normal', SpeedPresets.NORMAL]]);
    expect(() => new SpeedManager(profiles, 'missing')).toThrow('missing');
  });

  it('throws on set with unknown name', () => {
    const mgr = createManager();
    expect(() => mgr.set('missing')).toThrow('missing');
  });

  it('addProfile adds a new profile', () => {
    const mgr = createManager();
    mgr.addProfile('custom', { ...SpeedPresets.NORMAL, name: 'custom', spinSpeed: 99 });
    mgr.set('custom');
    expect(mgr.active.spinSpeed).toBe(99);
  });

  it('getProfile returns undefined for unknown', () => {
    const mgr = createManager();
    expect(mgr.getProfile('nope')).toBeUndefined();
  });

  it('profileNames lists all profiles', () => {
    const mgr = createManager();
    expect(mgr.profileNames).toEqual(['normal', 'turbo', 'superTurbo']);
  });
});
