import { describe, it, expect, beforeEach } from 'vitest';
import { CartesianKinematics } from '../../core/kinematics/CartesianKinematics';

describe('CartesianKinematics Unit Tests', () => {
  let kinematics: CartesianKinematics;

  beforeEach(() => {
    kinematics = new CartesianKinematics();
  });

  // TC-07: Move Duration & Distance
  it('TC-07: should accurately calculate 3D move displacement, distance, and duration', () => {
    // Start at (0, 0, 0)
    kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });

    // Move to (30, 40, 0) at F3000 (50 mm/s)
    const move = kinematics.calculateMove({ x: 30, y: 40, f: 3000 });

    expect(move.deltaX).toBeCloseTo(30);
    expect(move.deltaY).toBeCloseTo(40);
    expect(move.deltaZ).toBeCloseTo(0);
    expect(move.distanceXYZ).toBeCloseTo(50.0); // 3-4-5 right triangle
    expect(move.durationSeconds).toBeCloseTo(1.0); // 50mm / (3000/60 mm/s) = 1.0s
  });

  it('should support full homing (G28) resetting all axes to origin', () => {
    kinematics.setCurrentPosition({ x: 150, y: 120, z: 45, e: 10 });
    kinematics.home();

    const state = kinematics.getState();
    expect(state.currentPosition.x).toBe(0);
    expect(state.currentPosition.y).toBe(0);
    expect(state.currentPosition.z).toBe(0);
    expect(state.isHomed.x).toBe(true);
    expect(state.isHomed.y).toBe(true);
    expect(state.isHomed.z).toBe(true);
  });

  it('should support selective axis homing (e.g. G28 X)', () => {
    kinematics.setCurrentPosition({ x: 50, y: 80, z: 20, e: 5 });
    kinematics.home({ x: true, y: false, z: false });

    const state = kinematics.getState();
    expect(state.currentPosition.x).toBe(0);
    expect(state.currentPosition.y).toBe(80); // unchanged
    expect(state.currentPosition.z).toBe(20); // unchanged
    expect(state.isHomed.x).toBe(true);
    expect(state.isHomed.y).toBe(false);
    expect(state.isHomed.z).toBe(false);
  });

  it('should handle relative positioning mode (G91)', () => {
    kinematics.setCurrentPosition({ x: 10, y: 20, z: 5, e: 0 });
    kinematics.setPositioningMode(true); // G91

    const move = kinematics.calculateMove({ x: 15, y: -5, z: 2 });
    expect(move.target.x).toBe(25);
    expect(move.target.y).toBe(15);
    expect(move.target.z).toBe(7);
  });

  it('should handle relative extruder mode (M83)', () => {
    kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 100 });
    kinematics.setExtruderMode(true); // M83

    const move = kinematics.calculateMove({ e: 2.5 });
    expect(move.deltaE).toBeCloseTo(2.5);
    expect(move.target.e).toBeCloseTo(102.5);
    expect(move.isExtruding).toBe(true);
  });

  it('should handle coordinate offset reset (G92)', () => {
    kinematics.setCurrentPosition({ x: 50, y: 50, z: 10, e: 250 });
    kinematics.setCoordinateOffset({ e: 0, x: 100 });

    const state = kinematics.getState();
    expect(state.currentPosition.e).toBe(0);
    expect(state.currentPosition.x).toBe(100);
    expect(state.currentPosition.y).toBe(50);
  });

  it('should clamp coordinates exceeding print volume boundaries', () => {
    const { clamped, wasClamped } = kinematics.clampCoordinates({
      x: 250, // exceeds 220
      y: -10, // below 0
      z: 300, // exceeds 250
      e: 10,
    });

    expect(wasClamped).toBe(true);
    expect(clamped.x).toBe(220);
    expect(clamped.y).toBe(0);
    expect(clamped.z).toBe(250);
  });

  it('should scale duration with speed override (M220)', () => {
    kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });
    kinematics.setFeedrate(3000); // 50 mm/s

    // At 100% speed factor
    const normalMove = kinematics.calculateMove({ x: 50 });
    expect(normalMove.durationSeconds).toBeCloseTo(1.0);

    // At 200% speed factor
    kinematics.setSpeedOverride(200);
    const fastMove = kinematics.calculateMove({ x: 50 });
    expect(fastMove.durationSeconds).toBeCloseTo(0.5);
  });

  it('should scale extrusion with flow override (M221)', () => {
    kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });
    kinematics.setFlowOverride(120); // 120% flow

    const move = kinematics.calculateMove({ e: 10 });
    expect(move.deltaE).toBeCloseTo(12.0);
  });

  it('should disable steppers and reset homed status (M84)', () => {
    kinematics.home();
    expect(kinematics.getState().isHomed.x).toBe(true);

    kinematics.setSteppersEnabled(false);
    expect(kinematics.getState().steppersEnabled).toBe(false);
    expect(kinematics.getState().isHomed.x).toBe(false);
  });

  it('should apply layer shift offset to physical position while keeping logical position intact', () => {
    kinematics.setCurrentPosition({ x: 50, y: 50, z: 10, e: 5 });
    kinematics.setLayerShiftOffset(8.5, -4.0);

    const logical = kinematics.getState().currentPosition;
    const physical = kinematics.getPhysicalPosition();

    expect(logical.x).toBe(50);
    expect(logical.y).toBe(50);
    expect(physical.x).toBeCloseTo(58.5);
    expect(physical.y).toBeCloseTo(46.0);
    expect(physical.z).toBe(10);
  });
});
